import { ApiError } from "@/lib/api-error"
import { env } from "@/lib/env"

const WORD = /^[A-Za-z]+(?:-[A-Za-z]+)*$/

export type GeneratedQuestion = {
  en: string
  zh: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export async function generateTranslations(word: string): Promise<GeneratedQuestion[]> {
  if (!WORD.test(word)) {
    throw new ApiError(`「${word}」不能交给出题接口`, 400)
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
      throw new ApiError(`出题超时了（${word}）`, 504)
    }
    throw new ApiError(`出题接口连不上（${word}）`, 502)
  }

  const text = await response.text()
  if (!response.ok) {
    const detail = text.replace(/\s+/g, " ").trim().slice(0, 180)
    throw new ApiError(detail ? `出题失败（${word}）：${detail}` : `出题失败（${word}）`, 502)
  }

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw new ApiError(`出题结果不是 JSON（${word}）`, 502)
  }
  if (!isRecord(body) || !Array.isArray(body.questions)) {
    throw new ApiError(`出题结果无法识别（${word}）`, 502)
  }

  const questions = body.questions.map((item, index) => {
    if (!isRecord(item) || typeof item.en !== "string" || typeof item.zh !== "string") {
      throw new ApiError(`${word} 的第 ${index + 1} 题缺少英文或译文`, 502)
    }
    const en = item.en.trim()
    const zh = item.zh.trim()
    if (!en || !zh) throw new ApiError(`${word} 的第 ${index + 1} 题是空的`, 502)
    return { en, zh }
  })

  if (questions.length !== 3) {
    throw new ApiError(`${word} 应生成 3 题，实际 ${questions.length} 题`, 502)
  }
  return questions
}
