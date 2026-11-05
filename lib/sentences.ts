import { ObjectId } from "mongodb"
import { ApiError } from "@/lib/api-error"
import { parseId } from "@/lib/practices"
import { collections, type SentenceDoc } from "@/lib/store"
import type { SavedSentence } from "@/lib/types"

function toSentence(doc: SentenceDoc): SavedSentence {
  return {
    id: doc._id.toHexString(),
    word: doc.word,
    en: doc.en,
    zh: doc.zh,
    points: doc.points,
    createdAt: doc.createdAt.toISOString(),
  }
}

export async function listSentences(limit = 200): Promise<SavedSentence[]> {
  const { sentences } = await collections()
  const docs = await sentences.find({}, { sort: { points: 1, createdAt: 1 }, limit }).toArray()
  return docs.map(toSentence)
}

export async function savePracticeLine(lineId: string): Promise<SavedSentence> {
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
  const { sentences } = await collections()
  const result = await sentences.deleteOne({ _id: parseId(id, "Sentence not found") })
  if (result.deletedCount !== 1) throw new ApiError("Sentence not found", 404)
}
