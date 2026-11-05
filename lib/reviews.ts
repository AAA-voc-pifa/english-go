import { ObjectId } from "mongodb"
import { ApiError } from "@/lib/api-error"
import { parseId } from "@/lib/practices"
import { collections, type ReviewDoc, type SentenceDoc } from "@/lib/store"
import { isAward, type Deck, type ReviewSummary } from "@/lib/types"

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

async function readDeck(doc: ReviewDoc): Promise<Deck> {
  const { sentences } = await collections()
  const ids = doc.items.map((item) => item.sentenceId)
  const docs = ids.length === 0 ? [] : await sentences.find({ _id: { $in: ids } }).toArray()
  return toDeck(doc, await pointsFor(docs))
}

export async function createReview(): Promise<Deck> {
  const { sentences, reviews } = await collections()
  const picked = await sentences.find({}, { sort: { points: 1, createdAt: 1 }, limit: REVIEW_SIZE }).toArray()
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
  return docs.map((doc) => ({
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

  await sentences.updateOne({ _id: sentence._id }, { $inc: { points: award } })
  const updated = await reviews.updateOne(
    { _id: doc._id },
    { $set: { "items.$[item].award": award } },
    { arrayFilters: [{ "item.sentenceId": objectId, "item.award": null }] },
  )
  if (updated.matchedCount !== 1) {
    await sentences.updateOne({ _id: sentence._id }, { $inc: { points: -award } }).catch(() => undefined)
    throw new ApiError("Already scored", 409)
  }
  return getReview(id)
}
