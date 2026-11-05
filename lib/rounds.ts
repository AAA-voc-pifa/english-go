import { ObjectId } from "mongodb"
import { ApiError } from "@/lib/api-error"
import { generateTranslations } from "@/lib/question-api"
import { collections, type LineDoc, type RoundDoc } from "@/lib/store"
import { isAward, type Award, type Line, type Round, type RoundSummary, type RoundWord } from "@/lib/types"
import { increaseWordPoints, listLowest } from "@/lib/voc"

function parseId(id: string, message: string): ObjectId {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new ApiError(message, 404)
  return new ObjectId(id)
}

function toLine(doc: LineDoc): Line {
  return {
    id: doc._id.toHexString(),
    word: doc.word,
    en: doc.en,
    zh: doc.zh,
    revealed: doc.revealed,
    award: doc.award,
  }
}

function toRound(doc: RoundDoc, lineDocs: LineDoc[]): Round {
  const ordered = lineDocs.slice().sort((left, right) => left.position - right.position)
  const last = Math.max(ordered.length - 1, 0)
  return {
    id: doc._id.toHexString(),
    createdAt: doc.createdAt.toISOString(),
    words: doc.words,
    lines: ordered.map(toLine),
    cursor: Math.min(Math.max(doc.cursor, 0), last),
  }
}

async function requireRound(id: string): Promise<RoundDoc> {
  const { rounds } = await collections()
  const doc = await rounds.findOne({ _id: parseId(id, "练习不存在") })
  if (!doc) throw new ApiError("练习不存在", 404)
  return doc
}

async function linesFor(roundId: ObjectId): Promise<LineDoc[]> {
  const { lines } = await collections()
  return lines.find({ roundId }, { sort: { position: 1 } }).toArray()
}

function shuffle<T>(items: T[]): T[] {
  const next = items.slice()
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1))
    const current = next[index]
    next[index] = next[swap]
    next[swap] = current
  }
  return next
}

export async function createRound(): Promise<Round> {
  const lowest = await listLowest(3, 0)
  if (lowest.length === 0) throw new ApiError("词表是空的，先去 my-voc 加单词", 409)

  const groups = await Promise.all(
    lowest.map(async (item) => ({
      word: item,
      questions: await generateTranslations(item.word),
    })),
  )

  const roundId = new ObjectId()
  const words: RoundWord[] = lowest.map((item) => ({ word: item.word, points: item.points }))
  const roundDoc: RoundDoc = {
    _id: roundId,
    createdAt: new Date(),
    cursor: 0,
    words,
  }
  const lineDocs: LineDoc[] = shuffle(
    groups.flatMap(({ word, questions }) =>
      questions.map((question) => ({
        word: word.word,
        en: question.en,
        zh: question.zh,
      })),
    ),
  ).map((question, position) => ({
    _id: new ObjectId(),
    roundId,
    position,
    word: question.word,
    en: question.en,
    zh: question.zh,
    revealed: false,
    award: null,
  }))

  const { rounds, lines } = await collections()
  await rounds.insertOne(roundDoc)
  try {
    await lines.insertMany(lineDocs)
  } catch (error) {
    await Promise.all([rounds.deleteOne({ _id: roundId }), lines.deleteMany({ roundId })])
    throw error
  }
  return toRound(roundDoc, lineDocs)
}

export async function listRounds(limit = 50): Promise<RoundSummary[]> {
  const { rounds, lines } = await collections()
  const docs = await rounds.find({}, { sort: { createdAt: -1 }, limit }).toArray()
  if (docs.length === 0) return []

  const ids = docs.map((doc) => doc._id)
  const lineDocs = await lines
    .find({ roundId: { $in: ids } })
    .project<{ roundId: ObjectId; award: Award | null }>({ roundId: 1, award: 1 })
    .toArray()

  const stats = new Map<string, { answered: number; total: number; gained: number }>()
  for (const line of lineDocs) {
    const key = line.roundId.toHexString()
    const current = stats.get(key) ?? { answered: 0, total: 0, gained: 0 }
    current.total += 1
    if (line.award !== null) {
      current.answered += 1
      current.gained += line.award
    }
    stats.set(key, current)
  }

  return docs.map((doc) => {
    const stat = stats.get(doc._id.toHexString()) ?? { answered: 0, total: 0, gained: 0 }
    return {
      id: doc._id.toHexString(),
      createdAt: doc.createdAt.toISOString(),
      words: doc.words,
      answered: stat.answered,
      total: stat.total,
      gained: stat.gained,
    }
  })
}

export async function getRound(id: string): Promise<Round> {
  const doc = await requireRound(id)
  return toRound(doc, await linesFor(doc._id))
}

export async function lineSentence(id: string): Promise<string> {
  const { lines } = await collections()
  const doc = await lines.findOne(
    { _id: parseId(id, "这句话不在练习里") },
    { projection: { en: 1 } },
  )
  if (!doc || typeof doc.en !== "string" || !doc.en) throw new ApiError("这句话不在练习里", 404)
  return doc.en
}

export async function setCursor(id: string, cursor: number): Promise<Round> {
  const doc = await requireRound(id)
  const count = (await linesFor(doc._id)).length
  if (!Number.isInteger(cursor) || cursor < 0 || cursor >= count) {
    throw new ApiError("题目位置不对", 400)
  }
  const { rounds } = await collections()
  await rounds.updateOne({ _id: doc._id }, { $set: { cursor } })
  return getRound(id)
}

export async function setRevealed(id: string, lineId: string, revealed: boolean): Promise<Round> {
  const doc = await requireRound(id)
  const { lines } = await collections()
  const result = await lines.updateOne(
    { _id: parseId(lineId, "题目不存在"), roundId: doc._id },
    { $set: { revealed } },
  )
  if (result.matchedCount !== 1) throw new ApiError("题目不存在", 404)
  return getRound(id)
}

export async function awardLine(id: string, lineId: string, award: number): Promise<Round> {
  if (!isAward(award)) throw new ApiError("分数只能是 5、10 或 15", 400)
  const doc = await requireRound(id)
  const { rounds, lines } = await collections()
  const lineObjectId = parseId(lineId, "题目不存在")
  const line = await lines.findOne({ _id: lineObjectId, roundId: doc._id })
  if (!line) throw new ApiError("题目不存在", 404)
  if (line.award !== null) throw new ApiError("这题已经打过分了", 409)

  const nextPoints = await increaseWordPoints(line.word, award)
  const updated = await lines.updateOne({ _id: line._id, award: null }, { $set: { award } })
  if (updated.matchedCount !== 1) {
    await increaseWordPoints(line.word, -award).catch(() => undefined)
    throw new ApiError("这题已经打过分了", 409)
  }

  try {
    await rounds.updateOne({ _id: doc._id, "words.word": line.word }, { $set: { "words.$.points": nextPoints } })
  } catch (error) {
    await lines.updateOne({ _id: line._id }, { $set: { award: null } }).catch(() => undefined)
    await increaseWordPoints(line.word, -award).catch(() => undefined)
    throw error
  }

  return getRound(id)
}
