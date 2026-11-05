import { MongoServerError, ObjectId, type Collection, type Db } from "mongodb"
import { getDb } from "@/lib/mongo"
import { isAward, type Award, type RoundWord } from "@/lib/types"

export type RoundDoc = {
  _id: ObjectId
  createdAt: Date
  cursor: number
  words: RoundWord[]
}

export type LineDoc = {
  _id: ObjectId
  roundId: ObjectId
  position: number
  word: string
  en: string
  zh: string
  revealed: boolean
  award: Award | null
}

type LegacyLine = {
  word: string
  en: string
  zh: string
  revealed: boolean
  award: Award | null
}

const MIGRATION_ID = "legacy-quizzes-v1"

let ready: Promise<void> | null = null

export async function collections(): Promise<{
  rounds: Collection<RoundDoc>
  lines: Collection<LineDoc>
}> {
  const db = await getDb()
  const rounds = db.collection<RoundDoc>("rounds")
  const lines = db.collection<LineDoc>("lines")
  ready ??= prepare(db, rounds, lines).catch((error: unknown) => {
    ready = null
    throw error
  })
  await ready
  return { rounds, lines }
}

async function prepare(db: Db, rounds: Collection<RoundDoc>, lines: Collection<LineDoc>) {
  await Promise.all([
    rounds.createIndex({ createdAt: -1 }, { name: "createdAt_desc" }),
    lines.createIndex({ roundId: 1, position: 1 }, { unique: true, name: "round_position" }),
  ])
  await migrateLegacyQuizzes(db, rounds, lines)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isDuplicate(error: unknown): boolean {
  return error instanceof MongoServerError && error.code === 11000
}

function readWords(value: unknown): RoundWord[] | null {
  if (!Array.isArray(value)) return null
  const words: RoundWord[] = []
  for (const item of value) {
    if (!isRecord(item) || typeof item.word !== "string" || typeof item.points !== "number") return null
    words.push({ word: item.word, points: item.points })
  }
  return words
}

function readLines(value: unknown): LegacyLine[] | null {
  if (!Array.isArray(value)) return null
  const lines: LegacyLine[] = []
  for (const item of value) {
    if (!isRecord(item)) return null
    if (typeof item.word !== "string" || typeof item.en !== "string" || typeof item.zh !== "string") return null
    if (item.award !== null && item.award !== undefined && (typeof item.award !== "number" || !isAward(item.award))) {
      return null
    }
    lines.push({
      word: item.word,
      en: item.en,
      zh: item.zh,
      revealed: item.revealed === true,
      award: typeof item.award === "number" && isAward(item.award) ? item.award : null,
    })
  }
  return lines
}

async function migrateLegacyQuizzes(db: Db, rounds: Collection<RoundDoc>, lines: Collection<LineDoc>) {
  const meta = db.collection<{ _id: string; count: number }>("meta")
  if (await meta.findOne({ _id: MIGRATION_ID })) return

  const names = await db.listCollections({ name: "quizzes" }, { nameOnly: true }).toArray()
  if (names.length === 0) {
    await meta.updateOne({ _id: MIGRATION_ID }, { $set: { count: 0 } }, { upsert: true })
    return
  }

  const legacy = await db.collection("quizzes").find().toArray()
  let count = 0
  for (const raw of legacy) {
    if (!isRecord(raw) || !(raw._id instanceof ObjectId)) continue
    const words = readWords(raw.words)
    const questions = readLines(raw.questions)
    if (!words || !questions) continue

    const createdAt = raw.createdAt instanceof Date ? raw.createdAt : new Date()
    const cursor = typeof raw.cursor === "number" && Number.isInteger(raw.cursor) ? raw.cursor : 0
    try {
      await rounds.updateOne(
        { _id: raw._id },
        { $setOnInsert: { createdAt, cursor, words } },
        { upsert: true },
      )
    } catch (error) {
      if (!isDuplicate(error)) throw error
    }

    const existing = await lines.countDocuments({ roundId: raw._id })
    if (existing === questions.length) {
      count += 1
      continue
    }
    if (existing > 0) await lines.deleteMany({ roundId: raw._id })
    if (questions.length === 0) {
      count += 1
      continue
    }

    try {
      await lines.insertMany(
        questions.map((question, position) => ({
          _id: new ObjectId(),
          roundId: raw._id as ObjectId,
          position,
          word: question.word,
          en: question.en,
          zh: question.zh,
          revealed: question.revealed,
          award: question.award,
        })),
      )
    } catch (error) {
      if (!isDuplicate(error)) throw error
    }
    count += 1
  }

  await meta.updateOne({ _id: MIGRATION_ID }, { $set: { count } }, { upsert: true })
}
