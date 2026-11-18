import { MongoServerError } from "mongodb"
import { generateMnemonic } from "@/lib/question-api"
import { ApiError } from "@/lib/api-error"
import { mnemonicSchema, type MnemonicDoc } from "@/lib/db-schema"
import { getDb } from "@/lib/mongo"
import { validatedCollection } from "@/lib/validated-collection"

function isDuplicate(error: unknown): boolean {
  return error instanceof MongoServerError && error.code === 11000
}

async function coll() {
  const db = await getDb()
  return validatedCollection(db.collection<MnemonicDoc>("mnemonics"), mnemonicSchema, "mnemonic")
}

export async function mnemonicsForWords(words: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(words.filter((word) => word.trim() !== ""))]
  if (unique.length === 0) return new Map()
  const docs = await (await coll()).findMany({ _id: { $in: unique } })
  return new Map(docs.map((doc) => [doc._id, doc.text]))
}

/** Return existing mnemonic, or generate once and store. Never regenerates. */
export async function ensureMnemonic(word: string): Promise<{ text: string; created: boolean }> {
  const key = word.trim()
  if (!key) throw new ApiError("Nothing to remember", 400)

  const mnemonics = await coll()
  const existing = await mnemonics.findOne({ _id: key })
  if (existing) return { text: existing.text, created: false }

  const generated = await generateMnemonic(key)
  const doc: MnemonicDoc = {
    _id: key,
    text: generated.text,
    createdAt: new Date(),
    raw: generated.raw,
  }
  try {
    await mnemonics.insertOne(doc)
    return { text: doc.text, created: true }
  } catch (error) {
    if (!isDuplicate(error)) throw error
    const again = await mnemonics.findOne({ _id: key })
    if (again) return { text: again.text, created: false }
    throw error
  }
}
