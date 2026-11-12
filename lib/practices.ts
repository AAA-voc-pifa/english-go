import { ObjectId } from "mongodb"
import { ApiError } from "@/lib/api-error"
import { generateMultiTranslations, generateTranslations } from "@/lib/question-api"
import { ensureSentence, sentencesByIds } from "@/lib/sentence-content"
import { collections, type PracticeDoc, type PracticeLine, type SentenceDoc } from "@/lib/store"
import {
  isAward,
  type Award,
  type Deck,
  type DeckCard,
  type DeckGroup,
  type PracticeKind,
  type PracticeSummary,
  type PracticeWord,
} from "@/lib/types"
import { increaseWordPoints, listLowest, type VocWord } from "@/lib/voc"

const DEEP_WORDS = 3
const WIDE_WORDS = 9
const WIDE_BATCH = 3
const MAX_OPEN_PRACTICES = 1

function practiceKind(doc: PracticeDoc): PracticeKind {
  return doc.kind === "wide" ? "wide" : "deep"
}

function sortedLines(doc: PracticeDoc): PracticeLine[] {
  return (doc.lines ?? []).slice().sort((left, right) => left.position - right.position)
}

async function openPracticeState(): Promise<{
  count: number
  busyWords: Set<string>
  openIds: string[]
}> {
  const { practices } = await collections()
  const docs = await practices
    .find({}, { projection: { _id: 1, words: 1, lines: 1, createdAt: 1 }, sort: { createdAt: 1, _id: 1 } })
    .toArray()
  if (docs.length === 0) return { count: 0, busyWords: new Set(), openIds: [] }

  const busyWords = new Set<string>()
  const openIds: string[] = []
  for (const doc of docs) {
    const lines = doc.lines ?? []
    if (lines.length === 0) continue
    const answered = lines.filter((line) => line.award !== null).length
    if (answered >= lines.length) continue
    openIds.push(doc._id.toHexString())
    for (const word of doc.words) busyWords.add(word.word)
  }

  return { count: openIds.length, busyWords, openIds }
}

export async function listOpenPracticeIds(): Promise<string[]> {
  return (await openPracticeState()).openIds
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

async function starredSentenceIds(sentenceIds: ObjectId[]): Promise<Set<string>> {
  if (sentenceIds.length === 0) return new Set()
  const { stars } = await collections()
  const docs = await stars
    .find({ sentenceId: { $in: sentenceIds } })
    .project<{ sentenceId: ObjectId }>({ sentenceId: 1 })
    .toArray()
  return new Set(docs.map((doc) => doc.sentenceId.toHexString()))
}

function toDeck(
  doc: PracticeDoc,
  sentenceMap: Map<string, SentenceDoc>,
  starred: Set<string>,
): Deck {
  const ordered = sortedLines(doc)
  const points = new Map(doc.words.map((word) => [word.word, word.points]))
  const cards: DeckCard[] = ordered.map((line) => {
    const sentence = sentenceMap.get(line.sentenceId.toHexString())
    if (!sentence) {
      throw new ApiError(`Missing sentence for practice line ${line._id.toHexString()}`, 500)
    }
    return {
      id: line._id.toHexString(),
      word: sentence.word,
      en: sentence.en,
      zh: sentence.zh,
      award: line.award,
      points: points.get(sentence.word) ?? 0,
      starred: starred.has(line.sentenceId.toHexString()),
    }
  })
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
    kind: practiceKind(doc),
    cursor: Math.min(Math.max(doc.cursor, 0), last),
    cards,
    groups,
  }
}

async function readDeck(doc: PracticeDoc): Promise<Deck> {
  const lines = sortedLines(doc)
  const sentenceMap = await sentencesByIds(lines.map((line) => line.sentenceId))
  return toDeck(doc, sentenceMap, await starredSentenceIds(lines.map((line) => line.sentenceId)))
}

async function pickWords(count: number, busyWords: Set<string>): Promise<VocWord[]> {
  const lowest = await listLowest(count, 0, busyWords)
  if (lowest.length === 0) {
    if (busyWords.size > 0) throw new ApiError("Every word is already in an open practice", 409)
    throw new ApiError("The word list is empty. Add words in my-voc first.", 409)
  }
  if (lowest.length < count) {
    throw new ApiError(`Need ${count} free words to start a practice, only ${lowest.length} left`, 409)
  }
  return lowest
}

async function buildLines(
  questions: Array<{ word: string; en: string; zh: string }>,
): Promise<{ lines: PracticeLine[]; sentenceMap: Map<string, SentenceDoc> }> {
  const sentenceMap = new Map<string, SentenceDoc>()
  const lines: PracticeLine[] = []
  for (const [position, question] of questions.entries()) {
    const sentence = await ensureSentence(question)
    sentenceMap.set(sentence._id.toHexString(), sentence)
    lines.push({
      _id: new ObjectId(),
      position,
      sentenceId: sentence._id,
      award: null,
    })
  }
  return { lines, sentenceMap }
}

async function persistPractice(
  practiceDoc: PracticeDoc,
  sentenceMap: Map<string, SentenceDoc>,
): Promise<Deck> {
  const { practices } = await collections()
  await practices.insertOne(practiceDoc)
  return toDeck(practiceDoc, sentenceMap, new Set())
}

async function createDeepPractice(busyWords: Set<string>): Promise<Deck> {
  const lowest = await pickWords(DEEP_WORDS, busyWords)
  const groups = await Promise.all(
    lowest.map(async (item) => {
      const generated = await generateTranslations(item.word)
      return { word: item, generated }
    }),
  )

  const practiceId = new ObjectId()
  const words: PracticeWord[] = lowest.map((item) => ({ word: item.word, points: item.points }))
  const questions = shuffle(
    groups.flatMap(({ word, generated }) =>
      generated.questions.map((question) => ({
        word: word.word,
        en: question.en,
        zh: question.zh,
      })),
    ),
  )
  const { lines, sentenceMap } = await buildLines(questions)
  const practiceDoc: PracticeDoc = {
    _id: practiceId,
    createdAt: new Date(),
    cursor: 0,
    kind: "deep",
    words,
    lines,
    questionRaws: groups.map(({ word, generated }) => ({
      words: [word.word],
      raw: generated.raw,
    })),
  }
  return persistPractice(practiceDoc, sentenceMap)
}

async function createWidePractice(busyWords: Set<string>): Promise<Deck> {
  const lowest = await pickWords(WIDE_WORDS, busyWords)
  const batches: Array<[VocWord, VocWord, VocWord]> = []
  for (let index = 0; index < WIDE_WORDS; index += WIDE_BATCH) {
    batches.push([lowest[index], lowest[index + 1], lowest[index + 2]])
  }

  const generatedBatches = await Promise.all(
    batches.map(async (batch) => {
      const generated = await generateMultiTranslations([batch[0].word, batch[1].word, batch[2].word])
      return { batch, generated }
    }),
  )

  const practiceId = new ObjectId()
  const words: PracticeWord[] = lowest.map((item) => ({ word: item.word, points: item.points }))
  const questions = generatedBatches.flatMap(({ generated }) =>
    generated.questions.map((question) => ({
      word: question.word,
      en: question.en,
      zh: question.zh,
    })),
  )
  const { lines, sentenceMap } = await buildLines(questions)
  const practiceDoc: PracticeDoc = {
    _id: practiceId,
    createdAt: new Date(),
    cursor: 0,
    kind: "wide",
    words,
    lines,
    questionRaws: generatedBatches.map(({ batch, generated }) => ({
      words: batch.map((item) => item.word),
      raw: generated.raw,
    })),
  }
  return persistPractice(practiceDoc, sentenceMap)
}

export async function createPractice(): Promise<Deck> {
  const open = await openPracticeState()
  if (open.count > MAX_OPEN_PRACTICES) {
    throw new ApiError("Finish an open practice before starting another", 409)
  }

  const kind: PracticeKind = Math.random() < 0.5 ? "deep" : "wide"
  if (kind === "wide") {
    try {
      return await createWidePractice(open.busyWords)
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        return createDeepPractice(open.busyWords)
      }
      throw error
    }
  }
  return createDeepPractice(open.busyWords)
}

export async function listPractices(
  limit = 20,
  cursor?: string,
): Promise<{ practices: PracticeSummary[]; nextCursor: string | null }> {
  const pageSize = Math.min(Math.max(limit, 1), 50)
  const { practices } = await collections()

  const filter: Record<string, unknown> = {}
  if (cursor) {
    const anchorId = parseId(cursor, "Invalid cursor")
    const anchor = await practices.findOne({ _id: anchorId }, { projection: { createdAt: 1 } })
    if (!anchor) return { practices: [], nextCursor: null }
    filter.$or = [
      { createdAt: { $lt: anchor.createdAt } },
      { createdAt: anchor.createdAt, _id: { $lt: anchorId } },
    ]
  }

  const docs = await practices
    .find(filter, { sort: { createdAt: -1, _id: -1 }, limit: pageSize + 1 })
    .toArray()
  const page = docs.slice(0, pageSize)
  if (page.length === 0) return { practices: [], nextCursor: null }

  const summaries = page.map((doc) => {
    const lines = doc.lines ?? []
    let answered = 0
    let gained = 0
    for (const line of lines) {
      if (line.award === null) continue
      answered += 1
      gained += line.award
    }
    return {
      id: doc._id.toHexString(),
      createdAt: doc.createdAt.toISOString(),
      kind: practiceKind(doc),
      words: doc.words,
      answered,
      total: lines.length,
      gained,
    }
  })
  return {
    practices: summaries,
    nextCursor: docs.length > pageSize ? summaries[summaries.length - 1].id : null,
  }
}

export async function getPractice(id: string): Promise<Deck> {
  return readDeck(await requirePractice(id))
}

export async function findPracticeLine(lineId: string): Promise<{
  practice: PracticeDoc
  line: PracticeLine
} | null> {
  const { practices } = await collections()
  const objectId = parseId(lineId, "Sentence not found")
  const practice = await practices.findOne({ "lines._id": objectId })
  if (!practice) return null
  const line = (practice.lines ?? []).find((entry) => entry._id.equals(objectId))
  if (!line) return null
  return { practice, line }
}

export async function cardSentence(id: string): Promise<string> {
  const { sentences } = await collections()
  const objectId = parseId(id, "That sentence isn't here")
  const found = await findPracticeLine(id).catch(() => null)
  if (found) {
    const sentence = await sentences.findOne({ _id: found.line.sentenceId }, { projection: { en: 1 } })
    if (sentence?.en) return sentence.en
  }
  const sentence = await sentences.findOne({ _id: objectId }, { projection: { en: 1 } })
  if (sentence?.en) return sentence.en
  throw new ApiError("That sentence isn't here", 404)
}

export async function setPracticeCursor(id: string, cursor: number): Promise<Deck> {
  const doc = await requirePractice(id)
  const count = sortedLines(doc).length
  if (!Number.isInteger(cursor) || cursor < 0 || cursor >= count) {
    throw new ApiError("That position is invalid", 400)
  }
  const { practices } = await collections()
  await practices.updateOne({ _id: doc._id }, { $set: { cursor } })
  return getPractice(id)
}

export async function awardPracticeLine(id: string, lineId: string, award: number): Promise<Deck> {
  if (!isAward(award)) throw new ApiError("Score must be 5, 10, or 15", 400)
  const doc = await requirePractice(id)
  const { practices } = await collections()
  const lineObjectId = parseId(lineId, "Sentence not found")
  const line = (doc.lines ?? []).find((entry) => entry._id.equals(lineObjectId))
  if (!line) throw new ApiError("Sentence not found", 404)
  if (line.award !== null) throw new ApiError("Already scored", 409)

  const sentenceMap = await sentencesByIds([line.sentenceId])
  const sentence = sentenceMap.get(line.sentenceId.toHexString())
  if (!sentence) throw new ApiError("Sentence not found", 404)

  const nextPoints = await increaseWordPoints(sentence.word, award)
  const updated = await practices.updateOne(
    { _id: doc._id, lines: { $elemMatch: { _id: lineObjectId, award: null } } },
    { $set: { "lines.$.award": award } },
  )
  if (updated.matchedCount !== 1) {
    await increaseWordPoints(sentence.word, -award).catch(() => undefined)
    throw new ApiError("Already scored", 409)
  }

  try {
    await practices.updateOne(
      { _id: doc._id, "words.word": sentence.word },
      { $set: { "words.$.points": nextPoints } },
    )
  } catch (error) {
    await practices
      .updateOne(
        { _id: doc._id, "lines._id": lineObjectId },
        { $set: { "lines.$.award": null } },
      )
      .catch(() => undefined)
    await increaseWordPoints(sentence.word, -award).catch(() => undefined)
    throw error
  }

  return getPractice(id)
}
