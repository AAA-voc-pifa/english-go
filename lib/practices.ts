import { ObjectId } from "mongodb"
import { ApiError } from "@/lib/api-error"
import { generateTranslations } from "@/lib/question-api"
import { collections, type PracticeDoc, type PracticeLineDoc } from "@/lib/store"
import {
  isAward,
  type Award,
  type Deck,
  type DeckCard,
  type DeckGroup,
  type PracticeSummary,
  type PracticeWord,
} from "@/lib/types"
import { increaseWordPoints, listAllWords } from "@/lib/voc"

const PRACTICE_WORDS = 3
const MAX_OPEN_PRACTICES = 1

async function openPracticeState(): Promise<{ count: number; busyWords: Set<string> }> {
  const { practices, practiceLines } = await collections()
  const docs = await practices.find({}, { projection: { _id: 1, words: 1 } }).toArray()
  if (docs.length === 0) return { count: 0, busyWords: new Set() }

  const ids = docs.map((doc) => doc._id)
  const lineDocs = await practiceLines
    .find({ practiceId: { $in: ids } })
    .project<{ practiceId: ObjectId; award: Award | null }>({ practiceId: 1, award: 1 })
    .toArray()

  const byPractice = new Map<string, { total: number; answered: number }>()
  for (const line of lineDocs) {
    const key = line.practiceId.toHexString()
    const current = byPractice.get(key) ?? { total: 0, answered: 0 }
    current.total += 1
    if (line.award !== null) current.answered += 1
    byPractice.set(key, current)
  }

  const busyWords = new Set<string>()
  let count = 0
  for (const doc of docs) {
    const stat = byPractice.get(doc._id.toHexString())
    if (!stat || stat.total === 0) continue
    if (stat.answered >= stat.total) continue
    count += 1
    for (const word of doc.words) busyWords.add(word.word)
  }
  return { count, busyWords }
}

export function parseId(id: string, message: string): ObjectId {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new ApiError(message, 404)
  return new ObjectId(id)
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

async function requirePractice(id: string): Promise<PracticeDoc> {
  const { practices } = await collections()
  const doc = await practices.findOne({ _id: parseId(id, "Practice not found") })
  if (!doc) throw new ApiError("Practice not found", 404)
  return doc
}

async function linesFor(practiceId: ObjectId): Promise<PracticeLineDoc[]> {
  const { practiceLines } = await collections()
  return practiceLines.find({ practiceId }, { sort: { position: 1 } }).toArray()
}

async function starredEnglish(lines: PracticeLineDoc[]): Promise<Set<string>> {
  const { sentences } = await collections()
  if (lines.length === 0) return new Set()
  const docs = await sentences
    .find({ en: { $in: lines.map((line) => line.en) } })
    .project<{ en: string }>({ en: 1 })
    .toArray()
  return new Set(docs.map((doc) => doc.en))
}

function toDeck(doc: PracticeDoc, lineDocs: PracticeLineDoc[], starred: Set<string>): Deck {
  const ordered = lineDocs.slice().sort((left, right) => left.position - right.position)
  const points = new Map(doc.words.map((word) => [word.word, word.points]))
  const cards: DeckCard[] = ordered.map((line) => ({
    id: line._id.toHexString(),
    word: line.word,
    en: line.en,
    zh: line.zh,
    revealed: line.revealed,
    award: line.award,
    points: points.get(line.word) ?? 0,
    starred: starred.has(line.en),
  }))
  const groups: DeckGroup[] = doc.words.map((word) => ({
    key: word.word,
    label: word.word,
    points: word.points,
    cardIds: cards.filter((card) => card.word === word.word).map((card) => card.id),
  }))
  const last = Math.max(cards.length - 1, 0)
  return {
    id: doc._id.toHexString(),
    createdAt: doc.createdAt.toISOString(),
    cursor: Math.min(Math.max(doc.cursor, 0), last),
    cards,
    groups,
  }
}

async function readDeck(doc: PracticeDoc): Promise<Deck> {
  const lines = await linesFor(doc._id)
  return toDeck(doc, lines, await starredEnglish(lines))
}

export async function createPractice(): Promise<Deck> {
  const open = await openPracticeState()
  if (open.count > MAX_OPEN_PRACTICES) {
    throw new ApiError("Finish an open practice before starting another", 409)
  }

  const allWords = await listAllWords()
  if (allWords.length === 0) throw new ApiError("The word list is empty. Add words in my-voc first.", 409)

  const available = allWords
    .filter((item) => !open.busyWords.has(item.word))
    .sort((left, right) => left.points - right.points || left.word.localeCompare(right.word))
  if (available.length === 0) {
    throw new ApiError("Every word is already in an open practice", 409)
  }
  const lowest = available.slice(0, PRACTICE_WORDS)
  if (lowest.length < PRACTICE_WORDS) {
    throw new ApiError(
      `Need ${PRACTICE_WORDS} free words to start a practice, only ${lowest.length} left`,
      409,
    )
  }

  const groups = await Promise.all(
    lowest.map(async (item) => {
      const generated = await generateTranslations(item.word)
      return { word: item, generated }
    }),
  )

  const practiceId = new ObjectId()
  const words: PracticeWord[] = lowest.map((item) => ({ word: item.word, points: item.points }))
  const practiceDoc: PracticeDoc = {
    _id: practiceId,
    createdAt: new Date(),
    cursor: 0,
    words,
    questionRaws: groups.map(({ word, generated }) => ({
      word: word.word,
      raw: generated.raw,
    })),
  }
  const lineDocs: PracticeLineDoc[] = shuffle(
    groups.flatMap(({ word, generated }) =>
      generated.questions.map((question) => ({
        word: word.word,
        en: question.en,
        zh: question.zh,
      })),
    ),
  ).map((question, position) => ({
    _id: new ObjectId(),
    practiceId,
    position,
    word: question.word,
    en: question.en,
    zh: question.zh,
    revealed: false,
    award: null,
  }))

  const { practices, practiceLines } = await collections()
  await practices.insertOne(practiceDoc)
  try {
    await practiceLines.insertMany(lineDocs)
  } catch (error) {
    await Promise.all([
      practices.deleteOne({ _id: practiceId }),
      practiceLines.deleteMany({ practiceId }),
    ])
    throw error
  }
  return toDeck(practiceDoc, lineDocs, new Set())
}

export async function listPractices(limit = 50): Promise<PracticeSummary[]> {
  const { practices, practiceLines } = await collections()
  const docs = await practices.find({}, { sort: { createdAt: -1 }, limit }).toArray()
  if (docs.length === 0) return []

  const ids = docs.map((doc) => doc._id)
  const lineDocs = await practiceLines
    .find({ practiceId: { $in: ids } })
    .project<{ practiceId: ObjectId; award: Award | null }>({ practiceId: 1, award: 1 })
    .toArray()

  const stats = new Map<string, { answered: number; total: number; gained: number }>()
  for (const line of lineDocs) {
    const key = line.practiceId.toHexString()
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

export async function getPractice(id: string): Promise<Deck> {
  return readDeck(await requirePractice(id))
}

export async function cardSentence(id: string): Promise<string> {
  const { practiceLines, sentences } = await collections()
  const objectId = parseId(id, "That sentence isn't here")
  const line = await practiceLines.findOne({ _id: objectId }, { projection: { en: 1 } })
  if (line && typeof line.en === "string" && line.en) return line.en
  const sentence = await sentences.findOne({ _id: objectId }, { projection: { en: 1 } })
  if (sentence && typeof sentence.en === "string" && sentence.en) return sentence.en
  throw new ApiError("That sentence isn't here", 404)
}

export async function setPracticeCursor(id: string, cursor: number): Promise<Deck> {
  const doc = await requirePractice(id)
  const count = (await linesFor(doc._id)).length
  if (!Number.isInteger(cursor) || cursor < 0 || cursor >= count) {
    throw new ApiError("That position is invalid", 400)
  }
  const { practices } = await collections()
  await practices.updateOne({ _id: doc._id }, { $set: { cursor } })
  return getPractice(id)
}

export async function setPracticeRevealed(id: string, lineId: string, revealed: boolean): Promise<Deck> {
  const doc = await requirePractice(id)
  const { practiceLines } = await collections()
  const result = await practiceLines.updateOne(
    { _id: parseId(lineId, "Sentence not found"), practiceId: doc._id },
    { $set: { revealed } },
  )
  if (result.matchedCount !== 1) throw new ApiError("Sentence not found", 404)
  return getPractice(id)
}

export async function awardPracticeLine(id: string, lineId: string, award: number): Promise<Deck> {
  if (!isAward(award)) throw new ApiError("Score must be 5, 10, or 15", 400)
  const doc = await requirePractice(id)
  const { practices, practiceLines } = await collections()
  const lineObjectId = parseId(lineId, "Sentence not found")
  const line = await practiceLines.findOne({ _id: lineObjectId, practiceId: doc._id })
  if (!line) throw new ApiError("Sentence not found", 404)
  if (line.award !== null) throw new ApiError("Already scored", 409)

  const nextPoints = await increaseWordPoints(line.word, award)
  const updated = await practiceLines.updateOne({ _id: line._id, award: null }, { $set: { award } })
  if (updated.matchedCount !== 1) {
    await increaseWordPoints(line.word, -award).catch(() => undefined)
    throw new ApiError("Already scored", 409)
  }

  try {
    await practices.updateOne(
      { _id: doc._id, "words.word": line.word },
      { $set: { "words.$.points": nextPoints } },
    )
  } catch (error) {
    await practiceLines.updateOne({ _id: line._id }, { $set: { award: null } }).catch(() => undefined)
    await increaseWordPoints(line.word, -award).catch(() => undefined)
    throw error
  }

  return getPractice(id)
}
