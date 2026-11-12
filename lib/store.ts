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
  sentenceId: ObjectId
  revealed: boolean
  award: Award | null
}

/** Canonical sentence text. Every practice line points here. */
export type SentenceDoc = {
  _id: ObjectId
  word: string
  en: string
  zh: string
  createdAt: Date
}

/** Favourite / review progress for a sentence. */
export type StarDoc = {
  _id: ObjectId
  sentenceId: ObjectId
  points: number
  createdAt: Date
}

export type ReviewItemDoc = {
  sentenceId: ObjectId
  revealed: boolean
  award: Award | null
}

export type ReviewDoc = {
  _id: ObjectId
  createdAt: Date
  cursor: number
  items: ReviewItemDoc[]
}

const LEGACY_MIGRATION_ID = "legacy-quizzes-rounds-v1"
const STARS_MIGRATION_ID = "sentence-content-stars-v1"

let ready: Promise<void> | null = null

export async function collections(): Promise<{
  practices: Collection<PracticeDoc>
  practiceLines: Collection<PracticeLineDoc>
  sentences: Collection<SentenceDoc>
  stars: Collection<StarDoc>
  reviews: Collection<ReviewDoc>
}> {
  const db = await getDb()
  const practices = db.collection<PracticeDoc>("practices")
  const practiceLines = db.collection<PracticeLineDoc>("practice_lines")
  const sentences = db.collection<SentenceDoc>("sentences")
  const stars = db.collection<StarDoc>("stars")
  const reviews = db.collection<ReviewDoc>("reviews")
  ready ??= prepare(db, practices, practiceLines, sentences, stars, reviews).catch((error: unknown) => {
    ready = null
    throw error
  })
  await ready
  return { practices, practiceLines, sentences, stars, reviews }
}

async function prepare(
  db: Db,
  practices: Collection<PracticeDoc>,
  practiceLines: Collection<PracticeLineDoc>,
  sentences: Collection<SentenceDoc>,
  stars: Collection<StarDoc>,
  reviews: Collection<ReviewDoc>,
) {
  await migrateLegacy(db, practices, practiceLines, sentences)
  await migrateSentenceStars(db, practiceLines, sentences, stars, reviews)
  await Promise.all([
    practices.createIndex({ createdAt: -1 }, { name: "createdAt_desc" }),
    practiceLines.createIndex({ practiceId: 1, position: 1 }, { unique: true, name: "practice_position" }),
    practiceLines.createIndex({ sentenceId: 1 }, { name: "sentenceId" }),
    sentences.createIndex({ en: 1 }, { unique: true, name: "en" }),
    stars.createIndex({ sentenceId: 1 }, { unique: true, name: "sentenceId" }),
    stars.createIndex({ points: 1, createdAt: 1, _id: 1 }, { name: "points_createdAt" }),
    reviews.createIndex({ createdAt: -1 }, { name: "createdAt_desc" }),
  ])
  try {
    await sentences.dropIndex("points_createdAt")
  } catch {
    // Index may already be gone after migration.
  }
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

async function ensureSentenceId(
  sentences: Collection<SentenceDoc>,
  input: { word: string; en: string; zh: string },
): Promise<ObjectId> {
  const existing = await sentences.findOne({ en: input.en }, { projection: { _id: 1 } })
  if (existing) return existing._id

  const doc: SentenceDoc = {
    _id: new ObjectId(),
    word: input.word,
    en: input.en,
    zh: input.zh,
    createdAt: new Date(),
  }
  try {
    await sentences.insertOne(doc)
    return doc._id
  } catch (error) {
    if (!isDuplicate(error)) throw error
    const again = await sentences.findOne({ en: input.en }, { projection: { _id: 1 } })
    if (!again) throw error
    return again._id
  }
}

async function migrateLegacy(
  db: Db,
  practices: Collection<PracticeDoc>,
  practiceLines: Collection<PracticeLineDoc>,
  sentences: Collection<SentenceDoc>,
) {
  const migrations = db.collection<{ _id: string }>("migrations")
  if (await migrations.findOne({ _id: LEGACY_MIGRATION_ID })) return

  await migrateRounds(db, practices, practiceLines, sentences)
  await migrateQuizzes(db, practices, practiceLines, sentences)
  await migrations.updateOne({ _id: LEGACY_MIGRATION_ID }, { $set: { at: new Date() } }, { upsert: true })
}

async function migrateRounds(
  db: Db,
  practices: Collection<PracticeDoc>,
  practiceLines: Collection<PracticeLineDoc>,
  sentences: Collection<SentenceDoc>,
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
      const sentenceId = await ensureSentenceId(sentences, {
        word: item.word,
        en: item.en,
        zh: item.zh,
      })
      lines.push({
        _id: item._id,
        practiceId: raw._id,
        position,
        sentenceId,
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
  sentences: Collection<SentenceDoc>,
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
      const sentenceId = await ensureSentenceId(sentences, {
        word: item.word,
        en: item.en,
        zh: item.zh,
      })
      lines.push({
        _id: new ObjectId(),
        practiceId: raw._id,
        position: lines.length,
        sentenceId,
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

async function migrateSentenceStars(
  db: Db,
  practiceLines: Collection<PracticeLineDoc>,
  sentences: Collection<SentenceDoc>,
  stars: Collection<StarDoc>,
  reviews: Collection<ReviewDoc>,
) {
  const migrations = db.collection<{ _id: string }>("migrations")
  if (await migrations.findOne({ _id: STARS_MIGRATION_ID })) return

  // Unique before upserts so a crashed mid-migration cannot insert duplicate stars.
  await stars.createIndex({ sentenceId: 1 }, { unique: true, name: "sentenceId" })

  // Old favourites lived in `sentences` with a `points` field.
  // Insert/upsert the star FIRST, then drop `points` — otherwise a crash after
  // $unset leaves a sentence with no star and the retry query skips it.
  const legacyFavourites = db.collection("sentences")
  for await (const raw of legacyFavourites.find({ points: { $exists: true } })) {
    if (!isRecord(raw) || !(raw._id instanceof ObjectId)) continue
    if (typeof raw.word !== "string" || typeof raw.en !== "string" || typeof raw.zh !== "string") continue
    const points = typeof raw.points === "number" ? raw.points : 0
    const createdAt = raw.createdAt instanceof Date ? raw.createdAt : new Date()
    await stars.updateOne(
      { sentenceId: raw._id },
      {
        $setOnInsert: {
          _id: new ObjectId(),
          sentenceId: raw._id,
          points,
          createdAt,
        },
      },
      { upsert: true },
    )
    await sentences.updateOne(
      { _id: raw._id },
      {
        $set: { word: raw.word, en: raw.en, zh: raw.zh, createdAt },
        $unset: { points: "" },
      },
      { upsert: true },
    )
  }

  // Old practice lines embedded word/en/zh.
  const legacyLines = db.collection("practice_lines")
  for await (const raw of legacyLines.find({ sentenceId: { $exists: false } })) {
    if (!isRecord(raw) || !(raw._id instanceof ObjectId)) continue
    if (!(raw.practiceId instanceof ObjectId)) continue
    if (typeof raw.word !== "string" || typeof raw.en !== "string" || typeof raw.zh !== "string") continue
    const sentenceId = await ensureSentenceId(sentences, {
      word: raw.word,
      en: raw.en,
      zh: raw.zh,
    })
    await practiceLines.updateOne(
      { _id: raw._id },
      {
        $set: { sentenceId },
        $unset: { word: "", en: "", zh: "" },
      },
    )
  }

  for await (const raw of reviews.find()) {
    if (!isRecord(raw) || !(raw._id instanceof ObjectId) || !Array.isArray(raw.items)) continue
    const items: ReviewItemDoc[] = []
    for (const item of raw.items) {
      if (!isRecord(item) || !(item.sentenceId instanceof ObjectId)) continue
      const award = readAward(item.award)
      if (award === undefined) continue
      items.push({
        sentenceId: item.sentenceId,
        revealed: item.revealed === true,
        award,
      })
    }
    await reviews.updateOne({ _id: raw._id }, { $set: { items } })
  }

  await migrations.updateOne({ _id: STARS_MIGRATION_ID }, { $set: { at: new Date() } }, { upsert: true })
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
