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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export async function generateTranslations(word: string): Promise<GeneratedQuestions> {
  if (!WORD.test(word)) {
    throw new ApiError(`"${word}" can't be sent to the question service`, 400)
  }

  const url = new URL("e2c", `${env().questionBase}/`)
  url.searchParams.set("word", word)

  let response: Response
  try {
    response = await fetch(url, {
      headers: { password: env().questionPassword },
      cache: "no-store",
      signal: AbortSignal.timeout(90_000),
    })
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new ApiError(`Question timed out (${word})`, 504)
    }
    throw new ApiError(`Can't reach the question service (${word})`, 502)
  }

  const text = await response.text()
  if (!response.ok) {
    const detail = text.replace(/\s+/g, " ").trim().slice(0, 180)
    throw new ApiError(detail ? `Question failed (${word}): ${detail}` : `Question failed (${word})`, 502)
  }

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw new ApiError(`Question response was not JSON (${word})`, 502)
  }
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
