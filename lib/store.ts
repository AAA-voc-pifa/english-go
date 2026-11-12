import { MongoServerError, ObjectId, type Collection, type Db } from "mongodb"
import {
  practiceSchema,
  reviewSchema,
  sentenceSchema,
  starSchema,
  type PracticeDoc,
  type PracticeLine,
  type PracticeQuestionRaw,
  type ReviewDoc,
  type ReviewItemDoc,
  type SentenceDoc,
  type StarDoc,
} from "@/lib/db-schema"
import { getDb } from "@/lib/mongo"
import { isAward, type Award, type PracticeWord } from "@/lib/types"
import { validatedCollection, type DocCollection } from "@/lib/validated-collection"

export type {
  PracticeDoc,
  PracticeLine,
  PracticeQuestionRaw,
  ReviewDoc,
  ReviewItemDoc,
  SentenceDoc,
  StarDoc,
}

const LEGACY_MIGRATION_ID = "legacy-quizzes-rounds-v1"
const STARS_MIGRATION_ID = "sentence-content-stars-v1"
const EMBED_LINES_MIGRATION_ID = "embed-practice-lines-v1"
const PRACTICE_KIND_MIGRATION_ID = "practice-kind-v1"
const QUESTION_RAWS_WORDS_MIGRATION_ID = "question-raws-words-v1"

export type AppCollections = {
  practices: DocCollection<PracticeDoc>
  sentences: DocCollection<SentenceDoc>
  stars: DocCollection<StarDoc>
  reviews: DocCollection<ReviewDoc>
}

let ready: Promise<void> | null = null

export async function collections(): Promise<AppCollections> {
  const db = await getDb()
  const practicesRaw = db.collection<PracticeDoc>("practices")
  const sentencesRaw = db.collection<SentenceDoc>("sentences")
  const starsRaw = db.collection<StarDoc>("stars")
  const reviewsRaw = db.collection<ReviewDoc>("reviews")
  ready ??= prepare(db, practicesRaw, sentencesRaw, starsRaw, reviewsRaw).catch((error: unknown) => {
    ready = null
    throw error
  })
  await ready
  return {
    practices: validatedCollection(practicesRaw, practiceSchema, "practice"),
    sentences: validatedCollection(sentencesRaw, sentenceSchema, "sentence"),
    stars: validatedCollection(starsRaw, starSchema, "star"),
    reviews: validatedCollection(reviewsRaw, reviewSchema, "review"),
  }
}

async function prepare(
  db: Db,
  practices: Collection<PracticeDoc>,
  sentences: Collection<SentenceDoc>,
  stars: Collection<StarDoc>,
  reviews: Collection<ReviewDoc>,
) {
  await migrateLegacy(db, practices, sentences)
  await migrateSentenceStars(db, practices, sentences, stars, reviews)
  await migrateEmbedLines(db, practices, reviews)
  await migratePracticeKind(db, practices)
  await migrateQuestionRawsWords(db, practices)
  await Promise.all([
    practices.createIndex({ createdAt: -1 }, { name: "createdAt_desc" }),
    practices.createIndex({ "lines._id": 1 }, { name: "lines_id" }),
    sentences.createIndex({ en: 1 }, { unique: true, name: "en" }),
    stars.createIndex({ sentenceId: 1 }, { unique: true, name: "sentenceId" }),
    stars.createIndex({ points: 1, createdAt: 1, _id: 1 }, { name: "points_createdAt" }),
    reviews.createIndex({ createdAt: -1 }, { name: "createdAt_desc" }),
  ])
  try {
    await sentences.dropIndex("points_createdAt")
  } catch {
    // Index may already be gone.
  }
}

async function migratePracticeKind(db: Db, practices: Collection<PracticeDoc>) {
  const migrations = db.collection<{ _id: string }>("migrations")
  if (await migrations.findOne({ _id: PRACTICE_KIND_MIGRATION_ID })) return
  await practices.updateMany({ kind: { $exists: false } }, { $set: { kind: "deep" } })
  await migrations.updateOne(
    { _id: PRACTICE_KIND_MIGRATION_ID },
    { $set: { at: new Date() } },
    { upsert: true },
  )
}

async function migrateQuestionRawsWords(db: Db, practices: Collection<PracticeDoc>) {
  const migrations = db.collection<{ _id: string }>("migrations")
  if (await migrations.findOne({ _id: QUESTION_RAWS_WORDS_MIGRATION_ID })) return

  const legacy = db.collection("practices")
  for await (const raw of legacy.find({ "questionRaws.word": { $exists: true } })) {
    if (!isRecord(raw) || !(raw._id instanceof ObjectId) || !Array.isArray(raw.questionRaws)) continue
    const questionRaws: PracticeQuestionRaw[] = []
    for (const item of raw.questionRaws) {
      if (!isRecord(item)) continue
      if (Array.isArray(item.words) && item.words.every((entry) => typeof entry === "string" && entry.length > 0)) {
        questionRaws.push({ words: item.words, raw: item.raw })
        continue
      }
      if (typeof item.word === "string" && item.word.trim() !== "") {
        questionRaws.push({ words: [item.word], raw: item.raw })
      }
    }
    await practices.updateOne({ _id: raw._id }, { $set: { questionRaws } })
  }

  await migrations.updateOne(
    { _id: QUESTION_RAWS_WORDS_MIGRATION_ID },
    { $set: { at: new Date() } },
    { upsert: true },
  )
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

async function migrateLegacy(db: Db, practices: Collection<PracticeDoc>, sentences: Collection<SentenceDoc>) {
  const migrations = db.collection<{ _id: string }>("migrations")
  if (await migrations.findOne({ _id: LEGACY_MIGRATION_ID })) return

  await migrateRounds(db, practices, sentences)
  await migrateQuizzes(db, practices, sentences)
  await migrations.updateOne({ _id: LEGACY_MIGRATION_ID }, { $set: { at: new Date() } }, { upsert: true })
}

async function migrateRounds(db: Db, practices: Collection<PracticeDoc>, sentences: Collection<SentenceDoc>) {
  const names = await db.listCollections({ name: "rounds" }, { nameOnly: true }).toArray()
  if (names.length === 0) return
  const legacyLines = db.collection("lines")

  for await (const raw of db.collection("rounds").find()) {
    if (!isRecord(raw) || !(raw._id instanceof ObjectId)) continue
    const words = readWords(raw.words)
    if (!words) continue
    const createdAt = raw.createdAt instanceof Date ? raw.createdAt : new Date()
    const cursor = typeof raw.cursor === "number" && Number.isInteger(raw.cursor) ? raw.cursor : 0

    const stored = await legacyLines.find({ roundId: raw._id }).sort({ position: 1 }).toArray()
    const lines: PracticeLine[] = []
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
      lines.push({ _id: item._id, position, sentenceId, award })
    }
    await upsertPractice(practices, raw._id, { createdAt, cursor, kind: "deep", words, lines })
  }
}

async function migrateQuizzes(db: Db, practices: Collection<PracticeDoc>, sentences: Collection<SentenceDoc>) {
  const names = await db.listCollections({ name: "quizzes" }, { nameOnly: true }).toArray()
  if (names.length === 0) return

  for await (const raw of db.collection("quizzes").find()) {
    if (!isRecord(raw) || !(raw._id instanceof ObjectId)) continue
    if (await practices.findOne({ _id: raw._id }, { projection: { _id: 1 } })) continue
    const words = readWords(raw.words)
    const questions = Array.isArray(raw.questions) ? raw.questions : null
    if (!words || !questions) continue

    const lines: PracticeLine[] = []
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
      lines.push({ _id: new ObjectId(), position: lines.length, sentenceId, award })
    }

    const createdAt = raw.createdAt instanceof Date ? raw.createdAt : new Date()
    const cursor = typeof raw.cursor === "number" && Number.isInteger(raw.cursor) ? raw.cursor : 0
    await upsertPractice(practices, raw._id, { createdAt, cursor, kind: "deep", words, lines })
  }
}

async function migrateSentenceStars(
  db: Db,
  practices: Collection<PracticeDoc>,
  sentences: Collection<SentenceDoc>,
  stars: Collection<StarDoc>,
  reviews: Collection<ReviewDoc>,
) {
  const migrations = db.collection<{ _id: string }>("migrations")
  if (await migrations.findOne({ _id: STARS_MIGRATION_ID })) return

  await stars.createIndex({ sentenceId: 1 }, { unique: true, name: "sentenceId" })

  const legacySentences = db.collection("sentences")
  for await (const raw of legacySentences.find({ points: { $exists: true } })) {
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

  // Older DBs may still have a separate practice_lines collection.
  const lineNames = await db.listCollections({ name: "practice_lines" }, { nameOnly: true }).toArray()
  if (lineNames.length > 0) {
    const legacyLines = db.collection("practice_lines")
    for await (const raw of legacyLines.find({ sentenceId: { $exists: false } })) {
      if (!isRecord(raw) || !(raw._id instanceof ObjectId)) continue
      if (typeof raw.word !== "string" || typeof raw.en !== "string" || typeof raw.zh !== "string") continue
      const sentenceId = await ensureSentenceId(sentences, {
        word: raw.word,
        en: raw.en,
        zh: raw.zh,
      })
      await legacyLines.updateOne(
        { _id: raw._id },
        { $set: { sentenceId }, $unset: { word: "", en: "", zh: "" } },
      )
    }
  }

  // Also fix any embedded lines that somehow still carry word/en/zh (none expected).
  const legacyPractices = db.collection("practices")
  for await (const raw of legacyPractices.find({ "lines.en": { $exists: true } })) {
    if (!isRecord(raw) || !(raw._id instanceof ObjectId) || !Array.isArray(raw.lines)) continue
    const lines: PracticeLine[] = []
    for (const item of raw.lines) {
      if (!isRecord(item) || !(item._id instanceof ObjectId)) continue
      const award = readAward(item.award)
      if (award === undefined) continue
      let sentenceId: ObjectId
      if (item.sentenceId instanceof ObjectId) {
        sentenceId = item.sentenceId
      } else if (typeof item.word === "string" && typeof item.en === "string" && typeof item.zh === "string") {
        sentenceId = await ensureSentenceId(sentences, {
          word: item.word,
          en: item.en,
          zh: item.zh,
        })
      } else {
        continue
      }
      const position = typeof item.position === "number" ? item.position : lines.length
      lines.push({ _id: item._id, position, sentenceId, award })
    }
    await practices.updateOne({ _id: raw._id }, { $set: { lines } })
  }

  for await (const raw of reviews.find()) {
    if (!isRecord(raw) || !(raw._id instanceof ObjectId) || !Array.isArray(raw.items)) continue
    const items: ReviewItemDoc[] = []
    for (const item of raw.items) {
      if (!isRecord(item) || !(item.sentenceId instanceof ObjectId)) continue
      const award = readAward(item.award)
      if (award === undefined) continue
      items.push({ sentenceId: item.sentenceId, award })
    }
    await reviews.updateOne({ _id: raw._id }, { $set: { items } })
  }

  await migrations.updateOne({ _id: STARS_MIGRATION_ID }, { $set: { at: new Date() } }, { upsert: true })
}

async function migrateEmbedLines(db: Db, practices: Collection<PracticeDoc>, reviews: Collection<ReviewDoc>) {
  const migrations = db.collection<{ _id: string }>("migrations")
  if (await migrations.findOne({ _id: EMBED_LINES_MIGRATION_ID })) return

  const lineNames = await db.listCollections({ name: "practice_lines" }, { nameOnly: true }).toArray()
  const legacyLines = lineNames.length > 0 ? db.collection("practice_lines") : null

  for await (const practice of practices.find({})) {
    let lines: PracticeLine[] = []
    if (Array.isArray(practice.lines) && practice.lines.length > 0) {
      for (const item of practice.lines) {
        if (!isRecord(item) || !(item._id instanceof ObjectId)) continue
        if (!(item.sentenceId instanceof ObjectId)) continue
        const award = readAward(item.award)
        if (award === undefined) continue
        const position = typeof item.position === "number" ? item.position : lines.length
        lines.push({ _id: item._id, position, sentenceId: item.sentenceId, award })
      }
    } else if (legacyLines) {
      const stored = await legacyLines.find({ practiceId: practice._id }).sort({ position: 1 }).toArray()
      for (const item of stored) {
        if (!isRecord(item) || !(item._id instanceof ObjectId)) continue
        if (!(item.sentenceId instanceof ObjectId)) continue
        const award = readAward(item.award)
        if (award === undefined) continue
        const position = typeof item.position === "number" ? item.position : lines.length
        lines.push({ _id: item._id, position, sentenceId: item.sentenceId, award })
      }
    }
    await practices.updateOne({ _id: practice._id }, { $set: { lines } })
  }

  if (legacyLines) await legacyLines.drop()

  for await (const raw of reviews.find()) {
    if (!isRecord(raw) || !(raw._id instanceof ObjectId) || !Array.isArray(raw.items)) continue
    const items: ReviewItemDoc[] = []
    for (const item of raw.items) {
      if (!isRecord(item) || !(item.sentenceId instanceof ObjectId)) continue
      const award = readAward(item.award)
      if (award === undefined) continue
      items.push({ sentenceId: item.sentenceId, award })
    }
    await reviews.updateOne({ _id: raw._id }, { $set: { items } })
  }

  await migrations.updateOne({ _id: EMBED_LINES_MIGRATION_ID }, { $set: { at: new Date() } }, { upsert: true })
}

async function upsertPractice(
  practices: Collection<PracticeDoc>,
  id: ObjectId,
  doc: {
    createdAt: Date
    cursor: number
    kind: "deep" | "wide"
    words: PracticeWord[]
    lines: PracticeLine[]
  },
) {
  try {
    await practices.updateOne({ _id: id }, { $setOnInsert: doc }, { upsert: true })
  } catch (error) {
    if (!isDuplicate(error)) throw error
  }
}
