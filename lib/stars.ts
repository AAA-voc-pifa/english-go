import { ObjectId } from "mongodb"
import { ApiError } from "@/lib/api-error"
import { findPracticeLine, parseId } from "@/lib/practices"
import { requireSentence } from "@/lib/sentence-content"
import { collections, type SentenceDoc, type StarDoc } from "@/lib/store"
import type { StarredSentence } from "@/lib/types"

function toStarred(star: StarDoc, sentence: SentenceDoc): StarredSentence {
  return {
    id: star._id.toHexString(),
    word: sentence.word,
    en: sentence.en,
    zh: sentence.zh,
    points: star.points,
    createdAt: star.createdAt.toISOString(),
  }
}

export async function listStars(
  limit = 20,
  cursor?: string,
): Promise<{ sentences: StarredSentence[]; nextCursor: string | null }> {
  const pageSize = Math.min(Math.max(limit, 1), 50)
  const { stars, sentences } = await collections()

  const filter: Record<string, unknown> = {}
  if (cursor) {
    const anchorId = parseId(cursor, "Invalid cursor")
    const anchor = await stars.findOne({ _id: anchorId }, { projection: { points: 1, createdAt: 1 } })
    if (!anchor) return { sentences: [], nextCursor: null }
    filter.$or = [
      { points: { $gt: anchor.points } },
      { points: anchor.points, createdAt: { $gt: anchor.createdAt } },
      { points: anchor.points, createdAt: anchor.createdAt, _id: { $gt: anchorId } },
    ]
  }

  const docs = await stars
    .find(filter, { sort: { points: 1, createdAt: 1, _id: 1 }, limit: pageSize + 1 })
    .toArray()
  const page = docs.slice(0, pageSize)
  if (page.length === 0) return { sentences: [], nextCursor: null }

  const sentenceDocs = await sentences
    .find({ _id: { $in: page.map((star) => star.sentenceId) } })
    .toArray()
  const byId = new Map(sentenceDocs.map((doc) => [doc._id.toHexString(), doc]))
  const starred: StarredSentence[] = []
  for (const star of page) {
    const sentence = byId.get(star.sentenceId.toHexString())
    if (!sentence) continue
    starred.push(toStarred(star, sentence))
  }

  return {
    sentences: starred,
    nextCursor: docs.length > pageSize ? page[page.length - 1]._id.toHexString() : null,
  }
}

export async function starPracticeLine(lineId: string): Promise<StarredSentence> {
  const { stars } = await collections()
  const found = await findPracticeLine(lineId)
  if (!found) throw new ApiError("Sentence not found", 404)

  const sentence = await requireSentence(found.line.sentenceId)
  const existing = await stars.findOne({ sentenceId: sentence._id })
  if (existing) return toStarred(existing, sentence)

  const doc: StarDoc = {
    _id: new ObjectId(),
    sentenceId: sentence._id,
    points: 0,
    createdAt: new Date(),
  }
  try {
    await stars.insertOne(doc)
  } catch {
    const again = await stars.findOne({ sentenceId: sentence._id })
    if (again) return toStarred(again, sentence)
    throw new ApiError("Couldn't star the sentence", 500)
  }
  return toStarred(doc, sentence)
}

export async function deleteStar(id: string): Promise<void> {
  const { stars, reviews } = await collections()
  const objectId = parseId(id, "Sentence not found")
  const star = await stars.findOne({ _id: objectId })
  if (!star) throw new ApiError("Sentence not found", 404)

  const result = await stars.deleteOne({ _id: objectId })
  if (result.deletedCount !== 1) throw new ApiError("Sentence not found", 404)

  const sentenceId = star.sentenceId
  const affected = await reviews.find({ "items.sentenceId": sentenceId }).toArray()
  await Promise.all(
    affected.map((doc) => {
      const items = doc.items.filter((item) => !item.sentenceId.equals(sentenceId))
      const cursor = items.length === 0 ? 0 : Math.min(doc.cursor, items.length - 1)
      return reviews.updateOne({ _id: doc._id }, { $set: { items, cursor } })
    }),
  )
}

/** @deprecated Use listStars — kept name for API route imports during rename. */
export const listSentences = listStars
/** @deprecated Use deleteStar */
export const deleteSentence = deleteStar
