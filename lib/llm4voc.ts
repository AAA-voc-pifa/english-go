import { ApiError } from "@/lib/api-error"
import { mnemonicDataSchema, type MnemonicData } from "@/lib/db-schema"
import { env } from "@/lib/env"

/** Matches llm4voc word query: letters, optional hyphen compounds. */
const WORD = /^[A-Za-z]+(?:-[A-Za-z]+)*$/

export type GeneratedQuestion = {
  en: string
  zh: string
}

export type GeneratedQuestions = {
  word: string
  questions: GeneratedQuestion[]
  raw: unknown
}

export type GeneratedMultiQuestion = {
  word: string
  en: string
  zh: string
}

export type GeneratedMultiQuestions = {
  questions: GeneratedMultiQuestion[]
  raw: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

const LLM_TIMEOUT_MS = 90_000
/** `/mnemonic-j` can think a long time; keep room under the route maxDuration. */
const MNEMONIC_TIMEOUT_MS = 180_000

async function fetchLlm4voc(path: string, words: string[], timeoutMs = LLM_TIMEOUT_MS): Promise<unknown> {
  for (const word of words) {
    if (!WORD.test(word)) {
      throw new ApiError(`"${word}" can't be sent to llm4voc`, 400)
    }
  }

  const url = new URL(path, `${env().llm4vocBase}/`)
  for (const word of words) url.searchParams.append("word", word)
  const label = words.join(", ")

  let response: Response
  try {
    response = await fetch(url, {
      headers: { Authentication: env().llm4vocPassword },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new ApiError(`llm4voc timed out (${label})`, 504)
    }
    throw new ApiError(`Can't reach llm4voc (${label})`, 502)
  }

  const text = await response.text()
  if (!response.ok) {
    // Plain-text quirks from llm4voc: baD requesT / baD autH / noT founD / unknowN erroR
    const detail = text.replace(/\s+/g, " ").trim().slice(0, 180)
    throw new ApiError(detail ? `llm4voc failed (${label}): ${detail}` : `llm4voc failed (${label})`, 502)
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new ApiError(`llm4voc response was not JSON (${label})`, 502)
  }
}

/** GET /e2c — three EN→ZH sentences for one word. */
export async function generateTranslations(word: string): Promise<GeneratedQuestions> {
  const body = await fetchLlm4voc("e2c", [word])
  if (!isRecord(body) || !isRecord(body.data) || !Array.isArray(body.data.questions) || !("raw" in body)) {
    throw new ApiError(`llm4voc response was unreadable (${word})`, 502)
  }

  const questions = body.data.questions.map((item, index) => {
    if (!isRecord(item) || typeof item.en !== "string" || typeof item.zh !== "string") {
      throw new ApiError(`${word} sentence ${index + 1} is missing English or Chinese`, 502)
    }
    const en = item.en.trim()
    const zh = item.zh.trim()
    if (!en || !zh) throw new ApiError(`${word} sentence ${index + 1} is empty`, 502)
    return { en, zh }
  })

  if (questions.length !== 3) {
    throw new ApiError(`${word} should have 3 sentences, got ${questions.length}`, 502)
  }
  return { word, questions, raw: body.raw }
}

/** GET /e2c-multi — exactly three words → one sentence each, same order. */
export async function generateMultiTranslations(
  words: [string, string, string],
): Promise<GeneratedMultiQuestions> {
  const label = words.join(", ")
  const body = await fetchLlm4voc("e2c-multi", words)
  if (!isRecord(body) || !isRecord(body.data) || !Array.isArray(body.data.questions) || !("raw" in body)) {
    throw new ApiError(`llm4voc response was unreadable (${label})`, 502)
  }

  const questions = body.data.questions.map((item, index) => {
    if (
      !isRecord(item) ||
      typeof item.word !== "string" ||
      typeof item.en !== "string" ||
      typeof item.zh !== "string"
    ) {
      throw new ApiError(`Multi sentence ${index + 1} is missing word, English, or Chinese`, 502)
    }
    const word = item.word.trim()
    const en = item.en.trim()
    const zh = item.zh.trim()
    if (!word || !en || !zh) throw new ApiError(`Multi sentence ${index + 1} is empty`, 502)
    return { word, en, zh }
  })

  if (questions.length !== 3) {
    throw new ApiError(`e2c-multi should return 3 sentences, got ${questions.length}`, 502)
  }
  for (let index = 0; index < 3; index += 1) {
    if (questions[index].word.toLowerCase() !== words[index].toLowerCase()) {
      throw new ApiError(
        `e2c-multi word mismatch at ${index + 1}: expected ${words[index]}, got ${questions[index].word}`,
        502,
      )
    }
  }
  return { questions, raw: body.raw }
}

/** GET /mnemonic-j — structured mnemonic `{ data, raw }`. */
export async function generateMnemonic(word: string): Promise<{ data: MnemonicData; raw: unknown }> {
  const body = await fetchLlm4voc("mnemonic-j", [word], MNEMONIC_TIMEOUT_MS)
  if (!isRecord(body) || !("raw" in body)) {
    throw new ApiError(`Mnemonic response was unreadable (${word})`, 502)
  }
  const parsed = mnemonicDataSchema.safeParse(body.data)
  if (!parsed.success) {
    throw new ApiError(`Mnemonic response was unreadable (${word})`, 502)
  }
  return { data: parsed.data, raw: body.raw }
}
