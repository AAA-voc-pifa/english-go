import { MongoServerError, ObjectId } from "mongodb"
import { ApiError } from "@/lib/api-error"
import { collections, type SentenceDoc } from "@/lib/store"

function isDuplicate(error: unknown): boolean {
  return error instanceof MongoServerError && error.code === 11000
}

export async function ensureSentence(input: {
  word: string
  en: string
  zh: string
}): Promise<SentenceDoc> {
  const { sentences } = await collections()
  const existing = await sentences.findOne({ en: input.en })
  if (existing) return existing

  const doc: SentenceDoc = {
    _id: new ObjectId(),
    word: input.word,
    en: input.en,
    zh: input.zh,
    createdAt: new Date(),
  }
  try {
    await sentences.insertOne(doc)
    return doc
  } catch (error) {
    if (!isDuplicate(error)) throw error
    const again = await sentences.findOne({ en: input.en })
    if (!again) throw error
    return again
  }
}

export async function sentencesByIds(ids: ObjectId[]): Promise<Map<string, SentenceDoc>> {
  if (ids.length === 0) return new Map()
  const { sentences } = await collections()
  const docs = await sentences.findMany({ _id: { $in: ids } })
  return new Map(docs.map((doc) => [doc._id.toHexString(), doc]))
}

export async function requireSentence(id: ObjectId): Promise<SentenceDoc> {
  const { sentences } = await collections()
  const doc = await sentences.findOne({ _id: id })
  if (!doc) throw new ApiError("Sentence not found", 404)
  return doc
}
