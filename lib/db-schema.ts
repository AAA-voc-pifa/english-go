import { ObjectId } from "mongodb"
import { z } from "zod"
import { ApiError } from "@/lib/api-error"

export const objectIdSchema = z.instanceof(ObjectId)

export const awardSchema = z.union([z.literal(5), z.literal(10), z.literal(15)])
export const awardValueSchema = z.union([awardSchema, z.null()])

const nonEmptyString = z.string().min(1)

export const practiceWordSchema = z.strictObject({
  word: nonEmptyString,
  points: z.number().finite(),
})

export const practiceLineSchema = z.strictObject({
  _id: objectIdSchema,
  position: z.number().int().nonnegative(),
  sentenceId: objectIdSchema,
  award: awardValueSchema,
})

export const practiceQuestionRawSchema = z.strictObject({
  words: z.array(nonEmptyString).min(1),
  raw: z.unknown(),
})

export const practiceSchema = z
  .strictObject({
    _id: objectIdSchema,
    createdAt: z.date(),
    cursor: z.number().int().nonnegative(),
    kind: z.enum(["deep", "wide"]),
    words: z.array(practiceWordSchema).min(1),
    lines: z.array(practiceLineSchema),
    questionRaws: z.array(practiceQuestionRawSchema).optional(),
  })
  .superRefine((doc, ctx) => {
    const positions = new Set<number>()
    const lineIds = new Set<string>()
    for (const [index, line] of doc.lines.entries()) {
      if (positions.has(line.position)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate line position ${line.position}`,
          path: ["lines", index, "position"],
        })
      }
      positions.add(line.position)

      const lineId = line._id.toHexString()
      if (lineIds.has(lineId)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate line _id ${lineId}`,
          path: ["lines", index, "_id"],
        })
      }
      lineIds.add(lineId)
    }

    for (let expected = 0; expected < doc.lines.length; expected += 1) {
      if (!positions.has(expected)) {
        ctx.addIssue({
          code: "custom",
          message: `missing line position ${expected}`,
          path: ["lines"],
        })
      }
    }

    if (doc.lines.length === 0) {
      if (doc.cursor !== 0) {
        ctx.addIssue({
          code: "custom",
          message: `cursor ${doc.cursor} invalid for empty lines`,
          path: ["cursor"],
        })
      }
    } else if (doc.cursor >= doc.lines.length) {
      ctx.addIssue({
        code: "custom",
        message: `cursor ${doc.cursor} out of range for ${doc.lines.length} lines`,
        path: ["cursor"],
      })
    }

    const words = new Set<string>()
    for (const [index, item] of doc.words.entries()) {
      if (words.has(item.word)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate word "${item.word}"`,
          path: ["words", index, "word"],
        })
      }
      words.add(item.word)
    }
  })

export const sentenceSchema = z.strictObject({
  _id: objectIdSchema,
  word: nonEmptyString,
  en: nonEmptyString,
  zh: nonEmptyString,
  createdAt: z.date(),
})

export const starSchema = z.strictObject({
  _id: objectIdSchema,
  sentenceId: objectIdSchema,
  points: z.number().int().nonnegative(),
  createdAt: z.date(),
})

export const reviewItemSchema = z.strictObject({
  sentenceId: objectIdSchema,
  award: awardValueSchema,
})

export const reviewSchema = z
  .strictObject({
    _id: objectIdSchema,
    createdAt: z.date(),
    cursor: z.number().int().nonnegative(),
    items: z.array(reviewItemSchema),
  })
  .superRefine((doc, ctx) => {
    const seen = new Set<string>()
    for (const [index, item] of doc.items.entries()) {
      const id = item.sentenceId.toHexString()
      if (seen.has(id)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate sentenceId ${id}`,
          path: ["items", index, "sentenceId"],
        })
      }
      seen.add(id)
    }

    if (doc.items.length === 0) {
      if (doc.cursor !== 0) {
        ctx.addIssue({
          code: "custom",
          message: `cursor ${doc.cursor} invalid for empty items`,
          path: ["cursor"],
        })
      }
    } else if (doc.cursor >= doc.items.length) {
      ctx.addIssue({
        code: "custom",
        message: `cursor ${doc.cursor} out of range for ${doc.items.length} items`,
        path: ["cursor"],
      })
    }
  })

export const settingsSchema = z.strictObject({
  _id: z.literal("app"),
  autoSpeak: z.boolean(),
  voice: nonEmptyString,
  rate: nonEmptyString,
})

export type PracticeDoc = z.infer<typeof practiceSchema>
export type PracticeLine = z.infer<typeof practiceLineSchema>
export type PracticeQuestionRaw = z.infer<typeof practiceQuestionRawSchema>
export type SentenceDoc = z.infer<typeof sentenceSchema>
export type StarDoc = z.infer<typeof starSchema>
export type ReviewItemDoc = z.infer<typeof reviewItemSchema>
export type ReviewDoc = z.infer<typeof reviewSchema>
export type SettingsDoc = z.infer<typeof settingsSchema>

function labelFor(value: unknown, fallback: string): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "_id" in value &&
    (value as { _id: unknown })._id instanceof ObjectId
  ) {
    return `${fallback} ${(value as { _id: ObjectId })._id.toHexString()}`
  }
  return fallback
}

export function parseDoc<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  const detail = z.prettifyError(result.error).replace(/\s+/g, " ").trim()
  throw new ApiError(`Corrupt ${label}: ${detail}`, 500)
}

export function parseDocs<T>(schema: z.ZodType<T>, values: unknown[], label: string): T[] {
  return values.map((value, index) => parseDoc(schema, value, labelFor(value, `${label}[${index}]`)))
}
