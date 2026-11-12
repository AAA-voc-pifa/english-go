/**
 * Read-only integrity check for english-go MongoDB data.
 *
 *   pnpm check-db
 *   node --env-file=.env.local --experimental-strip-types scripts/check-db.mts
 */

import { MongoClient, ObjectId } from "mongodb"

type Severity = "error" | "warn" | "info"

type Issue = {
  severity: Severity
  scope: string
  id?: string
  message: string
}

const AWARDS = new Set([5, 10, 15])
const LEGACY_COLLECTIONS = ["rounds", "quizzes", "lines", "practice_lines"]
const EXPECTED_MIGRATIONS = [
  "legacy-quizzes-rounds-v1",
  "sentence-content-stars-v1",
  "embed-practice-lines-v1",
  "practice-kind-v1",
  "question-raws-words-v1",
]

const issues: Issue[] = []

function note(severity: Severity, scope: string, message: string, id?: string) {
  issues.push({ severity, scope, message, id })
}

function isObjectId(value: unknown): value is ObjectId {
  return value instanceof ObjectId
}

function isDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime())
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isAward(value: unknown): value is 5 | 10 | 15 | null {
  if (value === null) return true
  return typeof value === "number" && AWARDS.has(value)
}

function hex(id: ObjectId): string {
  return id.toHexString()
}

function short(text: string, max = 48): string {
  const one = text.replace(/\s+/g, " ").trim()
  return one.length <= max ? one : `${one.slice(0, max - 1)}…`
}

async function main() {
  const uri = process.env.MONGODB_URI?.trim()
  if (!uri) {
    console.error("Missing MONGODB_URI (load via --env-file=.env.local)")
    process.exit(2)
  }
  const dbName = process.env.MONGODB_DB?.trim() || "english-go"

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 })
  await client.connect()
  const db = client.db(dbName)

  try {
    const practices = db.collection("practices")
    const sentences = db.collection("sentences")
    const stars = db.collection("stars")
    const reviews = db.collection("reviews")
    const migrations = db.collection("migrations")

    const [practiceDocs, sentenceDocs, starDocs, reviewDocs, migrationDocs, collectionNames] =
      await Promise.all([
        practices.find({}).toArray(),
        sentences.find({}).toArray(),
        stars.find({}).toArray(),
        reviews.find({}).toArray(),
        migrations.find({}).toArray(),
        db.listCollections({}, { nameOnly: true }).toArray(),
      ])

    console.log(`Checking ${dbName}`)
    console.log(
      `counts: practices=${practiceDocs.length} sentences=${sentenceDocs.length} stars=${starDocs.length} reviews=${reviewDocs.length}`,
    )

    const present = new Set(collectionNames.map((entry) => entry.name))
    for (const name of LEGACY_COLLECTIONS) {
      if (present.has(name)) {
        note("warn", "legacy", `collection "${name}" still exists (expected after migrations to be gone or unused)`)
      }
    }

    const migrationIds = new Set<string>()
    for (const doc of migrationDocs) {
      if (typeof doc._id === "string") migrationIds.add(doc._id)
    }
    for (const id of EXPECTED_MIGRATIONS) {
      if (!migrationIds.has(id)) {
        note("warn", "migrations", `missing migration marker "${id}"`)
      }
    }

    const sentenceById = new Map<string, Record<string, unknown>>()
    const enCounts = new Map<string, string[]>()

    for (const raw of sentenceDocs) {
      if (!isObjectId(raw._id)) {
        note("error", "sentences", "invalid _id", String(raw._id))
        continue
      }
      const id = hex(raw._id)
      sentenceById.set(id, raw)

      if (typeof raw.word !== "string" || raw.word.trim() === "") {
        note("error", "sentences", "missing/empty word", id)
      }
      if (typeof raw.en !== "string" || raw.en.trim() === "") {
        note("error", "sentences", "missing/empty en", id)
      } else {
        const list = enCounts.get(raw.en) ?? []
        list.push(id)
        enCounts.set(raw.en, list)
      }
      if (typeof raw.zh !== "string" || raw.zh.trim() === "") {
        note("error", "sentences", "missing/empty zh", id)
      }
      if (!isDate(raw.createdAt)) {
        note("error", "sentences", "createdAt must be Date", id)
      }
      if ("points" in raw) {
        note("warn", "sentences", "legacy points field still present (should live on stars)", id)
      }
    }

    for (const [en, ids] of enCounts) {
      if (ids.length > 1) {
        note("error", "sentences", `duplicate en "${short(en)}" on ${ids.join(", ")}`)
      }
    }

    const starredSentenceIds = new Set<string>()
    const starSentenceCounts = new Map<string, number>()

    for (const raw of starDocs) {
      if (!isObjectId(raw._id)) {
        note("error", "stars", "invalid _id", String(raw._id))
        continue
      }
      const id = hex(raw._id)

      if (!isObjectId(raw.sentenceId)) {
        note("error", "stars", "invalid sentenceId", id)
        continue
      }
      const sentenceId = hex(raw.sentenceId)
      starredSentenceIds.add(sentenceId)
      starSentenceCounts.set(sentenceId, (starSentenceCounts.get(sentenceId) ?? 0) + 1)

      if (!sentenceById.has(sentenceId)) {
        note("error", "stars", `orphan: sentence ${sentenceId} missing`, id)
      }
      if (typeof raw.points !== "number" || !Number.isFinite(raw.points)) {
        note("error", "stars", "points must be a finite number", id)
      } else if (raw.points < 0) {
        note("warn", "stars", `negative points (${raw.points})`, id)
      } else if (!Number.isInteger(raw.points)) {
        note("warn", "stars", `non-integer points (${raw.points})`, id)
      }
      if (!isDate(raw.createdAt)) {
        note("error", "stars", "createdAt must be Date", id)
      }
    }

    for (const [sentenceId, count] of starSentenceCounts) {
      if (count > 1) {
        note("error", "stars", `duplicate stars for sentence ${sentenceId} (count=${count})`)
      }
    }

    const referencedSentenceIds = new Set<string>(starredSentenceIds)
    const lineIds = new Map<string, string>()

    for (const raw of practiceDocs) {
      if (!isObjectId(raw._id)) {
        note("error", "practices", "invalid _id", String(raw._id))
        continue
      }
      const id = hex(raw._id)

      if (!isDate(raw.createdAt)) {
        note("error", "practices", "createdAt must be Date", id)
      }
      if (raw.kind !== undefined && raw.kind !== "deep" && raw.kind !== "wide") {
        note("error", "practices", `invalid kind "${String(raw.kind)}"`, id)
      }

      if (!Array.isArray(raw.words)) {
        note("error", "practices", "words must be an array", id)
      } else {
        const seenWords = new Set<string>()
        for (const [index, item] of raw.words.entries()) {
          if (!isRecord(item)) {
            note("error", "practices", `words[${index}] not an object`, id)
            continue
          }
          if (typeof item.word !== "string" || item.word.trim() === "") {
            note("error", "practices", `words[${index}].word invalid`, id)
          } else if (seenWords.has(item.word)) {
            note("warn", "practices", `duplicate word "${item.word}" in words[]`, id)
          } else {
            seenWords.add(item.word)
          }
          if (typeof item.points !== "number" || !Number.isFinite(item.points)) {
            note("error", "practices", `words[${index}].points invalid`, id)
          }
        }
        if (raw.kind === "deep" && raw.words.length !== 3) {
          note("warn", "practices", `deep practice usually has 3 words (has ${raw.words.length})`, id)
        }
        if (raw.kind === "wide" && raw.words.length !== 9) {
          note("warn", "practices", `wide practice usually has 9 words (has ${raw.words.length})`, id)
        }
      }

      if (!Array.isArray(raw.lines)) {
        note("error", "practices", "lines must be an array", id)
        continue
      }

      const wordSet = new Set(
        Array.isArray(raw.words)
          ? raw.words
              .filter(isRecord)
              .map((item) => item.word)
              .filter((word): word is string => typeof word === "string")
          : [],
      )
      const positions = new Set<number>()
      let answered = 0

      for (const [index, item] of raw.lines.entries()) {
        if (!isRecord(item)) {
          note("error", "practices", `lines[${index}] not an object`, id)
          continue
        }
        if (!isObjectId(item._id)) {
          note("error", "practices", `lines[${index}]._id invalid`, id)
        } else {
          const lineId = hex(item._id)
          const previous = lineIds.get(lineId)
          if (previous) {
            note("error", "practices", `duplicate line _id ${lineId} also in practice ${previous}`, id)
          } else {
            lineIds.set(lineId, id)
          }
        }
        if (typeof item.position !== "number" || !Number.isInteger(item.position)) {
          note("error", "practices", `lines[${index}].position must be an integer`, id)
        } else {
          if (positions.has(item.position)) {
            note("error", "practices", `duplicate line position ${item.position}`, id)
          }
          positions.add(item.position)
        }
        if (!isObjectId(item.sentenceId)) {
          note("error", "practices", `lines[${index}].sentenceId invalid`, id)
        } else {
          const sentenceId = hex(item.sentenceId)
          referencedSentenceIds.add(sentenceId)
          const sentence = sentenceById.get(sentenceId)
          if (!sentence) {
            note("error", "practices", `lines[${index}] points to missing sentence ${sentenceId}`, id)
          } else if (typeof sentence.word === "string" && wordSet.size > 0 && !wordSet.has(sentence.word)) {
            note(
              "warn",
              "practices",
              `lines[${index}] word "${sentence.word}" not in practice.words`,
              id,
            )
          }
        }
        if (!isAward(item.award)) {
          note("error", "practices", `lines[${index}].award must be null|5|10|15`, id)
        } else if (item.award !== null) {
          answered += 1
        }
        for (const legacy of ["word", "en", "zh", "revealed"] as const) {
          if (legacy in item) {
            note("warn", "practices", `lines[${index}] still has legacy field "${legacy}"`, id)
          }
        }
      }

      const n = raw.lines.length
      if (raw.kind === "deep" && n !== 0 && n !== 9) {
        note("warn", "practices", `deep practice usually has 9 lines (has ${n})`, id)
      }
      if (raw.kind === "wide" && n !== 0 && n !== 9) {
        note("warn", "practices", `wide practice usually has 9 lines (has ${n})`, id)
      }

      for (let expected = 0; expected < n; expected += 1) {
        if (!positions.has(expected)) {
          note("warn", "practices", `missing line position ${expected}`, id)
        }
      }

      if (typeof raw.cursor !== "number" || !Number.isInteger(raw.cursor)) {
        note("error", "practices", "cursor must be an integer", id)
      } else if (n === 0) {
        if (raw.cursor !== 0) note("warn", "practices", `empty practice has cursor ${raw.cursor}`, id)
      } else if (raw.cursor < 0 || raw.cursor >= n) {
        note("error", "practices", `cursor ${raw.cursor} out of range for ${n} lines`, id)
      }

      if (n > 0 && answered > 0 && answered < n) {
        // open practice — fine
      }
    }

    for (const raw of reviewDocs) {
      if (!isObjectId(raw._id)) {
        note("error", "reviews", "invalid _id", String(raw._id))
        continue
      }
      const id = hex(raw._id)

      if (!isDate(raw.createdAt)) {
        note("error", "reviews", "createdAt must be Date", id)
      }
      if (!Array.isArray(raw.items)) {
        note("error", "reviews", "items must be an array", id)
        continue
      }

      const seen = new Set<string>()
      for (const [index, item] of raw.items.entries()) {
        if (!isRecord(item)) {
          note("error", "reviews", `items[${index}] not an object`, id)
          continue
        }
        if (!isObjectId(item.sentenceId)) {
          note("error", "reviews", `items[${index}].sentenceId invalid`, id)
          continue
        }
        const sentenceId = hex(item.sentenceId)
        referencedSentenceIds.add(sentenceId)
        if (seen.has(sentenceId)) {
          note("error", "reviews", `duplicate sentenceId ${sentenceId}`, id)
        }
        seen.add(sentenceId)

        if (!sentenceById.has(sentenceId)) {
          note("error", "reviews", `items[${index}] points to missing sentence ${sentenceId}`, id)
        } else if (!starredSentenceIds.has(sentenceId)) {
          note(
            "warn",
            "reviews",
            `items[${index}] sentence ${sentenceId} is not starred (app prunes on read)`,
            id,
          )
        }
        if (!isAward(item.award)) {
          note("error", "reviews", `items[${index}].award must be null|5|10|15`, id)
        }
        for (const legacy of ["word", "en", "zh", "revealed", "_id"] as const) {
          if (legacy in item) {
            note("warn", "reviews", `items[${index}] still has legacy field "${legacy}"`, id)
          }
        }
      }

      const n = raw.items.length
      if (n > 9) {
        note("warn", "reviews", `review has ${n} items (usually ≤9)`, id)
      }
      if (typeof raw.cursor !== "number" || !Number.isInteger(raw.cursor)) {
        note("error", "reviews", "cursor must be an integer", id)
      } else if (n === 0) {
        if (raw.cursor !== 0) note("warn", "reviews", `empty review has cursor ${raw.cursor}`, id)
      } else if (raw.cursor < 0 || raw.cursor >= n) {
        note("error", "reviews", `cursor ${raw.cursor} out of range for ${n} items`, id)
      }
    }

    let orphanSentences = 0
    for (const id of sentenceById.keys()) {
      if (!referencedSentenceIds.has(id)) {
        orphanSentences += 1
      }
    }
    if (orphanSentences > 0) {
      note(
        "info",
        "sentences",
        `${orphanSentences} sentence(s) not referenced by practices, stars, or reviews`,
      )
    }

    const settingsDoc = await db
      .collection<{ _id: string; autoSpeak?: unknown; voice?: unknown; rate?: unknown }>("settings")
      .findOne({ _id: "app" })
    if (settingsDoc) {
      if (typeof settingsDoc.autoSpeak !== "boolean") {
        note("warn", "settings", "autoSpeak should be boolean")
      }
      if (typeof settingsDoc.voice !== "string" || settingsDoc.voice.trim() === "") {
        note("warn", "settings", "voice should be a non-empty string")
      }
      if (typeof settingsDoc.rate !== "string" || settingsDoc.rate.trim() === "") {
        note("warn", "settings", "rate should be a non-empty string")
      }
    }

    const errors = issues.filter((issue) => issue.severity === "error")
    const warns = issues.filter((issue) => issue.severity === "warn")
    const infos = issues.filter((issue) => issue.severity === "info")

    const order: Severity[] = ["error", "warn", "info"]
    for (const severity of order) {
      const group = issues.filter((issue) => issue.severity === severity)
      for (const issue of group) {
        const tag = severity.toUpperCase().padEnd(5)
        const where = issue.id ? `${issue.scope} ${issue.id}` : issue.scope
        console.log(`${tag} ${where}: ${issue.message}`)
      }
    }

    console.log(
      `summary: ${errors.length} error(s), ${warns.length} warning(s), ${infos.length} info`,
    )
    process.exitCode = errors.length > 0 ? 1 : 0
  } finally {
    await client.close()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(2)
})
