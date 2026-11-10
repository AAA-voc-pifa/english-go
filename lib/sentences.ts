import { ObjectId } from "mongodb"
import { ApiError } from "@/lib/api-error"
import { parseId } from "@/lib/practices"
import { collections, type SentenceDoc } from "@/lib/store"
import type { StarredSentence } from "@/lib/types"

function toSentence(doc: SentenceDoc): StarredSentence {
  return {
    id: doc._id.toHexString(),
    word: doc.word,
    en: doc.en,
    zh: doc.zh,
    points: doc.points,
    createdAt: doc.createdAt.toISOString(),
  }
}

export async function listSentences(
  limit = 20,
  cursor?: string,
): Promise<{ sentences: StarredSentence[]; nextCursor: string | null }> {
  const pageSize = Math.min(Math.max(limit, 1), 50)
  const { sentences } = await collections()

  const filter: Record<string, unknown> = {}
  if (cursor) {
    const anchorId = parseId(cursor, "Invalid cursor")
    const anchor = await sentences.findOne(
      { _id: anchorId },
      { projection: { points: 1, createdAt: 1 } },
    )
    if (!anchor) return { sentences: [], nextCursor: null }
    filter.$or = [
      { points: { $gt: anchor.points } },
      { points: anchor.points, createdAt: { $gt: anchor.createdAt } },
      { points: anchor.points, createdAt: anchor.createdAt, _id: { $gt: anchorId } },
    ]
  }

  const docs = await sentences
    .find(filter, { sort: { points: 1, createdAt: 1, _id: 1 }, limit: pageSize + 1 })
    .toArray()
  const page = docs.slice(0, pageSize).map(toSentence)
  return {
    sentences: page,
    nextCursor: docs.length > pageSize ? page[page.length - 1].id : null,
  }
}

export async function starPracticeLine(lineId: string): Promise<StarredSentence> {
  const { practiceLines, sentences } = await collections()
  const line = await practiceLines.findOne({ _id: parseId(lineId, "Sentence not found") })
  if (!line) throw new ApiError("Sentence not found", 404)

  const existing = await sentences.findOne({ en: line.en })
  if (existing) return toSentence(existing)

  const doc: SentenceDoc = {
    _id: new ObjectId(),
    word: line.word,
    en: line.en,
    zh: line.zh,
    points: 0,
    createdAt: new Date(),
  }
  try {
    await sentences.insertOne(doc)
  } catch (error) {
    const again = await sentences.findOne({ en: line.en })
    if (again) return toSentence(again)
    throw error
  }
  return toSentence(doc)
}

export async function deleteSentence(id: string): Promise<void> {
  const { sentences, reviews } = await collections()
  const objectId = parseId(id, "Sentence not found")
  const result = await sentences.deleteOne({ _id: objectId })
  if (result.deletedCount !== 1) throw new ApiError("Sentence not found", 404)

  // Drop the sentence from any open/finished reviews so a mid-review Remove
  // cannot leave an unfinishable card behind.
  const affected = await reviews.find({ "items.sentenceId": objectId }).toArray()
  await Promise.all(
    affected.map((doc) => {
      const items = doc.items.filter((item) => !item.sentenceId.equals(objectId))
      const cursor = items.length === 0 ? 0 : Math.min(doc.cursor, items.length - 1)
      return reviews.updateOne({ _id: doc._id }, { $set: { items, cursor } })
    }),
  )
}
