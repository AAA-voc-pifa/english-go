import { ApiError } from "@/lib/api-error"
import { env } from "@/lib/env"

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

async function fetchQuestion(path: string, words: string[]): Promise<unknown> {
  for (const word of words) {
    if (!WORD.test(word)) {
      throw new ApiError(`"${word}" can't be sent to the question service`, 400)
    }
  }

  const url = new URL(path, `${env().questionBase}/`)
  for (const word of words) url.searchParams.append("word", word)
  const label = words.join(", ")

  let response: Response
  try {
    response = await fetch(url, {
      headers: { password: env().questionPassword },
      cache: "no-store",
      signal: AbortSignal.timeout(90_000),
    })
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new ApiError(`Question timed out (${label})`, 504)
    }
    throw new ApiError(`Can't reach the question service (${label})`, 502)
  }

  const text = await response.text()
  if (!response.ok) {
    const detail = text.replace(/\s+/g, " ").trim().slice(0, 180)
    throw new ApiError(detail ? `Question failed (${label}): ${detail}` : `Question failed (${label})`, 502)
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new ApiError(`Question response was not JSON (${label})`, 502)
  }
}

export async function generateTranslations(word: string): Promise<GeneratedQuestions> {
  const body = await fetchQuestion("e2c", [word])
  if (!isRecord(body) || !isRecord(body.data) || !Array.isArray(body.data.questions) || !("raw" in body)) {
    throw new ApiError(`Question response was unreadable (${word})`, 502)
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

export async function generateMultiTranslations(
  words: [string, string, string],
): Promise<GeneratedMultiQuestions> {
  const label = words.join(", ")
  const body = await fetchQuestion("e2c-multi", words)
  if (!isRecord(body) || !isRecord(body.data) || !Array.isArray(body.data.questions) || !("raw" in body)) {
    throw new ApiError(`Question response was unreadable (${label})`, 502)
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
