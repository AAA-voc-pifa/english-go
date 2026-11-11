import { MongoServerError, ObjectId, type Collection, type Db } from "mongodb"
import { getDb } from "@/lib/mongo"
import { isAward, type Award, type PracticeKind, type PracticeWord } from "@/lib/types"

export type PracticeQuestionRaw = {
  words: string[]
  raw: unknown
}

export type PracticeDoc = {
  _id: ObjectId
  createdAt: Date
  cursor: number
  /** Missing on legacy docs — treat as "deep". */
  kind?: PracticeKind
  words: PracticeWord[]
  /** LLM raw payloads from the question API; stored for records only. */
  questionRaws?: PracticeQuestionRaw[]
}

export type PracticeLineDoc = {
  _id: ObjectId
  practiceId: ObjectId
  position: number
  word: string
  en: string
  zh: string
  revealed: boolean
  award: Award | null
}

export type SentenceDoc = {
  _id: ObjectId
  word: string
  en: string
  zh: string
  points: number
  createdAt: Date
}

export type ReviewItemDoc = {
  sentenceId: ObjectId
  word: string
  en: string
  zh: string
  revealed: boolean
  award: Award | null
}

export type ReviewDoc = {
  _id: ObjectId
  createdAt: Date
  cursor: number
  items: ReviewItemDoc[]
}

const MIGRATION_ID = "legacy-quizzes-rounds-v1"

let ready: Promise<void> | null = null

export async function collections(): Promise<{
  practices: Collection<PracticeDoc>
  practiceLines: Collection<PracticeLineDoc>
  sentences: Collection<SentenceDoc>
  reviews: Collection<ReviewDoc>
}> {
  const db = await getDb()
  const practices = db.collection<PracticeDoc>("practices")
  const practiceLines = db.collection<PracticeLineDoc>("practice_lines")
  const sentences = db.collection<SentenceDoc>("sentences")
  const reviews = db.collection<ReviewDoc>("reviews")
  ready ??= prepare(db, practices, practiceLines, sentences, reviews).catch((error: unknown) => {
    ready = null
    throw error
  })
  await ready
  return { practices, practiceLines, sentences, reviews }
}

async function prepare(
  db: Db,
  practices: Collection<PracticeDoc>,
  practiceLines: Collection<PracticeLineDoc>,
  sentences: Collection<SentenceDoc>,
  reviews: Collection<ReviewDoc>,
) {
  await Promise.all([
    practices.createIndex({ createdAt: -1 }, { name: "createdAt_desc" }),
    practiceLines.createIndex({ practiceId: 1, position: 1 }, { unique: true, name: "practice_position" }),
    sentences.createIndex({ en: 1 }, { unique: true, name: "en" }),
    sentences.createIndex({ points: 1, createdAt: 1 }, { name: "points_createdAt" }),
    reviews.createIndex({ createdAt: -1 }, { name: "createdAt_desc" }),
  ])
  await migrateLegacy(db, practices, practiceLines)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isDuplicate(error: unknown): boolean {
  return error instanceof MongoServerError && error.code === 11000
}

function readWords(value: unknown): PracticeWord[] | null {
  if (!Array.isArray(value)) return null
  const words: PracticeWord[] = []
  for (const item of value) {
    if (!isRecord(item) || typeof item.word !== "string" || typeof item.points !== "number") return null
    words.push({ word: item.word, points: item.points })
  }
  return words
}

function readAward(value: unknown): Award | null | undefined {
  if (value === null || value === undefined) return null
  if (typeof value === "number" && isAward(value)) return value
  return undefined
}

async function migrateLegacy(
  db: Db,
  practices: Collection<PracticeDoc>,
  practiceLines: Collection<PracticeLineDoc>,
) {
  const migrations = db.collection<{ _id: string }>("migrations")
  if (await migrations.findOne({ _id: MIGRATION_ID })) return

  await migrateRounds(db, practices, practiceLines)
  await migrateQuizzes(db, practices, practiceLines)
  await migrations.updateOne({ _id: MIGRATION_ID }, { $set: { at: new Date() } }, { upsert: true })
}

async function migrateRounds(
  db: Db,
  practices: Collection<PracticeDoc>,
  practiceLines: Collection<PracticeLineDoc>,
) {
  const names = await db.listCollections({ name: "rounds" }, { nameOnly: true }).toArray()
  if (names.length === 0) return
  const legacyLines = db.collection("lines")

  for await (const raw of db.collection("rounds").find()) {
    if (!isRecord(raw) || !(raw._id instanceof ObjectId)) continue
    const words = readWords(raw.words)
    if (!words) continue
    const createdAt = raw.createdAt instanceof Date ? raw.createdAt : new Date()
    const cursor = typeof raw.cursor === "number" && Number.isInteger(raw.cursor) ? raw.cursor : 0
    await upsertPractice(practices, raw._id, { createdAt, cursor, words })

    const stored = await legacyLines.find({ roundId: raw._id }).sort({ position: 1 }).toArray()
    const lines: PracticeLineDoc[] = []
    for (const item of stored) {
      if (!isRecord(item) || !(item._id instanceof ObjectId)) continue
      const award = readAward(item.award)
      if (award === undefined) continue
      if (typeof item.word !== "string" || typeof item.en !== "string" || typeof item.zh !== "string") continue
      const position = typeof item.position === "number" ? item.position : lines.length
      lines.push({
        _id: item._id,
        practiceId: raw._id,
        position,
        word: item.word,
        en: item.en,
        zh: item.zh,
        revealed: item.revealed === true,
        award,
      })
    }
    await replaceLines(practiceLines, raw._id, lines)
  }
}

async function migrateQuizzes(
  db: Db,
  practices: Collection<PracticeDoc>,
  practiceLines: Collection<PracticeLineDoc>,
) {
  const names = await db.listCollections({ name: "quizzes" }, { nameOnly: true }).toArray()
  if (names.length === 0) return

  for await (const raw of db.collection("quizzes").find()) {
    if (!isRecord(raw) || !(raw._id instanceof ObjectId)) continue
    if (await practices.findOne({ _id: raw._id }, { projection: { _id: 1 } })) continue
    const words = readWords(raw.words)
    const questions = Array.isArray(raw.questions) ? raw.questions : null
    if (!words || !questions) continue

    const lines: PracticeLineDoc[] = []
    for (const item of questions) {
      if (!isRecord(item)) continue
      const award = readAward(item.award)
      if (award === undefined) continue
      if (typeof item.word !== "string" || typeof item.en !== "string" || typeof item.zh !== "string") continue
      lines.push({
        _id: new ObjectId(),
        practiceId: raw._id,
        position: lines.length,
        word: item.word,
        en: item.en,
        zh: item.zh,
        revealed: item.revealed === true,
        award,
      })
    }

    const createdAt = raw.createdAt instanceof Date ? raw.createdAt : new Date()
    const cursor = typeof raw.cursor === "number" && Number.isInteger(raw.cursor) ? raw.cursor : 0
    await upsertPractice(practices, raw._id, { createdAt, cursor, words })
    await replaceLines(practiceLines, raw._id, lines)
  }
}

async function upsertPractice(
  practices: Collection<PracticeDoc>,
  id: ObjectId,
  doc: { createdAt: Date; cursor: number; words: PracticeWord[] },
) {
  try {
    await practices.updateOne({ _id: id }, { $setOnInsert: doc }, { upsert: true })
  } catch (error) {
    if (!isDuplicate(error)) throw error
  }
}

async function replaceLines(practiceLines: Collection<PracticeLineDoc>, practiceId: ObjectId, lines: PracticeLineDoc[]) {
  const existing = await practiceLines.countDocuments({ practiceId })
  if (existing === lines.length) return
  if (existing > 0) await practiceLines.deleteMany({ practiceId })
  if (lines.length === 0) return
  try {
    await practiceLines.insertMany(lines)
  } catch (error) {
    if (!isDuplicate(error)) throw error
  }
}
