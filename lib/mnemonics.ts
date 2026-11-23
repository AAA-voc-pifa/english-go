import { MongoServerError } from "mongodb"
import { ApiError } from "@/lib/api-error"
import {
  mnemonicDataSchema,
  mnemonicSchema,
  type MnemonicData,
  type MnemonicDoc,
} from "@/lib/db-schema"
import { getDb } from "@/lib/mongo"
import { generateMnemonic } from "@/lib/question-api"
import type { MnemonicDetail, MnemonicSummary } from "@/lib/types"
import { validatedCollection } from "@/lib/validated-collection"

const STRUCTURED_MIGRATION_ID = "mnemonic-structured-v1"

function isDuplicate(error: unknown): boolean {
  return error instanceof MongoServerError && error.code === 11000
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function blankToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

function toSummary(doc: MnemonicDoc): MnemonicSummary {
  return {
    word: doc._id,
    allInOne: doc.data.all_in_one,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt?.toISOString() ?? null,
  }
}

function toDetail(doc: MnemonicDoc): MnemonicDetail {
  return {
    word: doc._id,
    data: doc.data,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt?.toISOString() ?? null,
  }
}

let ready: Promise<void> | null = null

async function prepare() {
  const db = await getDb()
  const raw = db.collection("mnemonics")
  const migrations = db.collection<{ _id: string }>("migrations")
  if (!(await migrations.findOne({ _id: STRUCTURED_MIGRATION_ID }))) {
    await raw.deleteMany({ text: { $exists: true }, data: { $exists: false } })
    await migrations.updateOne(
      { _id: STRUCTURED_MIGRATION_ID },
      { $set: { at: new Date() } },
      { upsert: true },
    )
  }
  await raw.createIndex({ createdAt: -1 }, { name: "createdAt_desc" })
}

async function coll() {
  const db = await getDb()
  ready ??= prepare().catch((error: unknown) => {
    ready = null
    throw error
  })
  await ready
  return validatedCollection(db.collection<MnemonicDoc>("mnemonics"), mnemonicSchema, "mnemonic")
}

export async function mnemonicsForWords(words: string[]): Promise<Map<string, MnemonicData>> {
  const unique = [...new Set(words.filter((word) => word.trim() !== ""))]
  if (unique.length === 0) return new Map()
  const docs = await (await coll()).findMany({ _id: { $in: unique } })
  return new Map(docs.map((doc) => [doc._id, doc.data]))
}

/** Return existing mnemonic, or generate once and store. Never regenerates. */
export async function ensureMnemonic(
  word: string,
): Promise<{ data: MnemonicData; created: boolean }> {
  const key = word.trim()
  if (!key) throw new ApiError("Nothing to remember", 400)

  const mnemonics = await coll()
  const existing = await mnemonics.findOne({ _id: key })
  if (existing) return { data: existing.data, created: false }

  const generated = await generateMnemonic(key)
  const doc: MnemonicDoc = {
    _id: key,
    data: generated.data,
    createdAt: new Date(),
    raw: generated.raw,
  }
  try {
    await mnemonics.insertOne(doc)
    return { data: doc.data, created: true }
  } catch (error) {
    if (!isDuplicate(error)) throw error
    const again = await mnemonics.findOne({ _id: key })
    if (again) return { data: again.data, created: false }
    throw error
  }
}

export async function listMnemonics(
  limit = 20,
  cursor?: string,
): Promise<{ mnemonics: MnemonicSummary[]; nextCursor: string | null }> {
  const pageSize = Math.min(Math.max(limit, 1), 50)
  const mnemonics = await coll()

  const filter: Record<string, unknown> = {}
  if (cursor) {
    const anchor = await mnemonics.findOne({ _id: cursor })
    if (!anchor) return { mnemonics: [], nextCursor: null }
    filter.$or = [
      { createdAt: { $lt: anchor.createdAt } },
      { createdAt: anchor.createdAt, _id: { $gt: anchor._id } },
    ]
  }

  const docs = await mnemonics.findMany(filter, {
    sort: { createdAt: -1, _id: 1 },
    limit: pageSize + 1,
  })
  const page = docs.slice(0, pageSize)
  return {
    mnemonics: page.map(toSummary),
    nextCursor: docs.length > pageSize ? page[page.length - 1]._id : null,
  }
}

export async function getMnemonic(word: string): Promise<MnemonicDetail> {
  const key = word.trim()
  if (!key) throw new ApiError("Mnemonic not found", 404)
  const doc = await (await coll()).findOne({ _id: key })
  if (!doc) throw new ApiError("Mnemonic not found", 404)
  return toDetail(doc)
}

export async function updateMnemonic(word: string, data: unknown): Promise<MnemonicDetail> {
  const key = word.trim()
  if (!key) throw new ApiError("Mnemonic not found", 404)

  const parsed = mnemonicDataSchema.safeParse(normalizeMnemonicData(data))
  if (!parsed.success) throw new ApiError("Mnemonic data is invalid", 400)

  const mnemonics = await coll()
  const existing = await mnemonics.findOne({ _id: key })
  if (!existing) throw new ApiError("Mnemonic not found", 404)

  const updatedAt = new Date()
  await mnemonics.updateOne({ _id: key }, { $set: { data: parsed.data, updatedAt } })
  return {
    word: key,
    data: parsed.data,
    createdAt: existing.createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  }
}

export async function deleteMnemonic(word: string): Promise<void> {
  const key = word.trim()
  if (!key) throw new ApiError("Mnemonic not found", 404)
  const result = await (await coll()).deleteOne({ _id: key })
  if (result.deletedCount !== 1) throw new ApiError("Mnemonic not found", 404)
}

/** Normalize edit payloads: trim strings, drop empty list items, coerce blanks to null. */
export function normalizeMnemonicData(input: unknown): MnemonicData {
  if (!isRecord(input)) throw new ApiError("Mnemonic data is invalid", 400)

  const etymologyRaw = input.etymology
  let etymology: MnemonicData["etymology"] = null
  if (etymologyRaw !== null && etymologyRaw !== undefined) {
    if (!isRecord(etymologyRaw)) throw new ApiError("Mnemonic data is invalid", 400)
    const components = Array.isArray(etymologyRaw.components)
      ? etymologyRaw.components
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter((item) => item !== "")
      : []
    const explanation =
      typeof etymologyRaw.explanation === "string" ? etymologyRaw.explanation.trim() : ""
    if (components.length > 0 && explanation) {
      etymology = { components, explanation }
    } else if (components.length > 0 || explanation) {
      throw new ApiError("Etymology needs both components and explanation", 400)
    }
  }

  const homophonicRaw = input.homophonic
  let homophonic: MnemonicData["homophonic"] = null
  if (homophonicRaw !== null && homophonicRaw !== undefined) {
    if (!isRecord(homophonicRaw)) throw new ApiError("Mnemonic data is invalid", 400)
    const list = Array.isArray(homophonicRaw.list)
      ? homophonicRaw.list
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter((item) => item !== "")
          .slice(0, 3)
      : []
    const best = typeof homophonicRaw.best === "number" ? Math.trunc(homophonicRaw.best) : 0
    if (list.length > 0) {
      homophonic = { list, best: Math.min(Math.max(best, 0), list.length - 1) }
    }
  }

  return {
    etymology,
    variant: blankToNull(typeof input.variant === "string" ? input.variant : null),
    homophonic,
    abbreviation: blankToNull(typeof input.abbreviation === "string" ? input.abbreviation : null),
    meme: blankToNull(typeof input.meme === "string" ? input.meme : null),
    other: blankToNull(typeof input.other === "string" ? input.other : null),
    all_in_one: blankToNull(typeof input.all_in_one === "string" ? input.all_in_one : null),
  }
}
