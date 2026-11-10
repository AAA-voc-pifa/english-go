import { ObjectId } from "mongodb"
import { ApiError } from "@/lib/api-error"
import { parseId } from "@/lib/practices"
import { collections, type ReviewDoc, type SentenceDoc } from "@/lib/store"
import { isAward, type Deck, type ReviewSummary } from "@/lib/types"
import { increaseWordPoints } from "@/lib/voc"

const REVIEW_SIZE = 9

function toDeck(doc: ReviewDoc, points: Map<string, number>): Deck {
  const cards = doc.items.map((item) => ({
    id: item.sentenceId.toHexString(),
    word: item.word,
    en: item.en,
    zh: item.zh,
    revealed: item.revealed,
    award: item.award,
    points: points.get(item.sentenceId.toHexString()) ?? 0,
    starred: true,
  }))
  const last = Math.max(cards.length - 1, 0)
  return {
    id: doc._id.toHexString(),
    createdAt: doc.createdAt.toISOString(),
    cursor: Math.min(Math.max(doc.cursor, 0), last),
    cards,
    groups: cards.map((card) => ({
      key: card.id,
      label: card.word,
      points: card.points,
      cardIds: [card.id],
    })),
  }
}

async function pointsFor(docs: SentenceDoc[]): Promise<Map<string, number>> {
  return new Map(docs.map((doc) => [doc._id.toHexString(), doc.points]))
}

async function requireReview(id: string): Promise<ReviewDoc> {
  const { reviews } = await collections()
  const doc = await reviews.findOne({ _id: parseId(id, "Review not found") })
  if (!doc) throw new ApiError("Review not found", 404)
  return doc
}

async function pruneMissingSentences(doc: ReviewDoc): Promise<ReviewDoc> {
  if (doc.items.length === 0) return doc
  const { sentences, reviews } = await collections()
  const ids = doc.items.map((item) => item.sentenceId)
  const found = await sentences
    .find({ _id: { $in: ids } })
    .project<{ _id: ObjectId }>({ _id: 1 })
    .toArray()
  const alive = new Set(found.map((entry) => entry._id.toHexString()))
  if (alive.size === doc.items.length) return doc

  const items = doc.items.filter((item) => alive.has(item.sentenceId.toHexString()))
  const cursor = items.length === 0 ? 0 : Math.min(doc.cursor, items.length - 1)
  await reviews.updateOne({ _id: doc._id }, { $set: { items, cursor } })
  return { ...doc, items, cursor }
}

async function readDeck(doc: ReviewDoc): Promise<Deck> {
  const pruned = await pruneMissingSentences(doc)
  const { sentences } = await collections()
  const ids = pruned.items.map((item) => item.sentenceId)
  const docs = ids.length === 0 ? [] : await sentences.find({ _id: { $in: ids } }).toArray()
  return toDeck(pruned, await pointsFor(docs))
}

function isOpenReview(doc: ReviewDoc): boolean {
  return doc.items.length > 0 && doc.items.some((item) => item.award === null)
}

async function findOpenReview(): Promise<ReviewDoc | null> {
  const { reviews } = await collections()
  const docs = await reviews.find({}, { sort: { createdAt: -1 } }).toArray()
  for (const doc of docs) {
    const pruned = await pruneMissingSentences(doc)
    if (isOpenReview(pruned)) return pruned
  }
  return null
}

export async function createReview(): Promise<Deck> {
  const open = await findOpenReview()
  if (open) return readDeck(open)

  const { sentences, reviews } = await collections()
  const candidates = await sentences.find({}, { sort: { points: 1, createdAt: 1 } }).toArray()
  const picked: SentenceDoc[] = []
  const seenWords = new Set<string>()
  for (const sentence of candidates) {
    if (seenWords.has(sentence.word)) continue
    seenWords.add(sentence.word)
    picked.push(sentence)
    if (picked.length >= REVIEW_SIZE) break
  }
  if (picked.length === 0) throw new ApiError("No starred sentences yet", 409)

  const doc: ReviewDoc = {
    _id: new ObjectId(),
    createdAt: new Date(),
    cursor: 0,
    items: picked.map((sentence) => ({
      sentenceId: sentence._id,
      word: sentence.word,
      en: sentence.en,
      zh: sentence.zh,
      revealed: false,
      award: null,
    })),
  }
  await reviews.insertOne(doc)
  return toDeck(doc, await pointsFor(picked))
}

export async function listReviews(limit = 20): Promise<ReviewSummary[]> {
  const { reviews } = await collections()
  const docs = await reviews.find({}, { sort: { createdAt: -1 }, limit }).toArray()
  const pruned = await Promise.all(docs.map(pruneMissingSentences))
  return pruned.map((doc) => ({
    id: doc._id.toHexString(),
    createdAt: doc.createdAt.toISOString(),
    answered: doc.items.filter((item) => item.award !== null).length,
    total: doc.items.length,
  }))
}

export async function getReview(id: string): Promise<Deck> {
  return readDeck(await requireReview(id))
}

export async function setReviewCursor(id: string, cursor: number): Promise<Deck> {
  const doc = await requireReview(id)
  if (!Number.isInteger(cursor) || cursor < 0 || cursor >= doc.items.length) {
    throw new ApiError("That position is invalid", 400)
  }
  const { reviews } = await collections()
  await reviews.updateOne({ _id: doc._id }, { $set: { cursor } })
  return getReview(id)
}

export async function setReviewRevealed(id: string, sentenceId: string, revealed: boolean): Promise<Deck> {
  const doc = await requireReview(id)
  const { reviews } = await collections()
  const result = await reviews.updateOne(
    { _id: doc._id },
    { $set: { "items.$[item].revealed": revealed } },
    { arrayFilters: [{ "item.sentenceId": parseId(sentenceId, "Sentence not found") }] },
  )
  if (result.matchedCount !== 1) throw new ApiError("Sentence not found", 404)
  return getReview(id)
}

function wordPointsFromSentenceAward(award: number): number {
  return Math.ceil((award * 2) / 3)
}

export async function awardReviewCard(id: string, sentenceId: string, award: number): Promise<Deck> {
  if (!isAward(award)) throw new ApiError("Score must be 5, 10, or 15", 400)
  const doc = await requireReview(id)
  const objectId = parseId(sentenceId, "Sentence not found")
  const item = doc.items.find((entry) => entry.sentenceId.equals(objectId))
  if (!item) throw new ApiError("Sentence not found", 404)
  if (item.award !== null) throw new ApiError("Already scored", 409)

  const { reviews, sentences } = await collections()
  const sentence = await sentences.findOne({ _id: objectId })
  if (!sentence) throw new ApiError("Sentence not found", 404)

  const wordDelta = wordPointsFromSentenceAward(award)
  await increaseWordPoints(sentence.word, wordDelta)
  try {
    await sentences.updateOne({ _id: sentence._id }, { $inc: { points: award } })
  } catch (error) {
    await increaseWordPoints(sentence.word, -wordDelta).catch(() => undefined)
    throw error
  }

  const updated = await reviews.updateOne(
    { _id: doc._id },
    { $set: { "items.$[item].award": award } },
    { arrayFilters: [{ "item.sentenceId": objectId, "item.award": null }] },
  )
  if (updated.matchedCount !== 1) {
    await Promise.all([
      sentences.updateOne({ _id: sentence._id }, { $inc: { points: -award } }).catch(() => undefined),
      increaseWordPoints(sentence.word, -wordDelta).catch(() => undefined),
    ])
    throw new ApiError("Already scored", 409)
  }
  return getReview(id)
}
