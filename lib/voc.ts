import { ApiError } from "@/lib/api-error"
import { env } from "@/lib/env"

type VocWord = {
  word: string
  points: number
}

function vocUrl(path: string, query?: Record<string, string>): URL {
  const url = new URL(path.replace(/^\//, ""), `${env().vocBase}/`)
  if (query) {
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
  }
  return url
}

async function vocFetch(url: URL, method: "GET" | "POST"): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers: { Authentication: env().vocPassword },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    })
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new ApiError("词表接口超时了", 504)
    }
    throw new ApiError("词表接口连不上", 502)
  }

  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiError(vocMessage(body, response.status), 502)
  }
  return body
}

function vocMessage(body: unknown, status: number): string {
  if (isRecord(body) && typeof body.error === "string" && body.error) {
    return `词表接口：${body.error}`
  }
  if (status === 401) return "词表接口未授权，检查 VOC_API_PASSWORD"
  return `词表接口失败（${status}）`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function readWord(value: unknown): VocWord {
  if (!isRecord(value) || typeof value.word !== "string" || typeof value.points !== "number") {
    throw new ApiError("词表接口返回无法识别", 502)
  }
  return { word: value.word, points: value.points }
}

export async function listLowest(count: number, points: number): Promise<VocWord[]> {
  const body = await vocFetch(vocUrl("voc", { count: String(count), points: String(points) }), "GET")
  if (!isRecord(body) || body.ok !== true || !Array.isArray(body.data)) {
    throw new ApiError("词表接口返回无法识别", 502)
  }
  return body.data.map(readWord)
}

export async function getWordPoints(word: string): Promise<number> {
  const body = await vocFetch(vocUrl(`voc/detail/${encodeURIComponent(word)}`), "GET")
  if (!isRecord(body) || body.ok !== true) {
    const message = isRecord(body) && typeof body.error === "string" ? body.error : "读不到单词分数"
    throw new ApiError(`词表接口：${message}`, 502)
  }
  return readWord(body.data).points
}

export async function setWordPoints(word: string, points: number): Promise<void> {
  const body = await vocFetch(
    vocUrl(`voc/points/${encodeURIComponent(word)}`, { points: String(points) }),
    "POST",
  )
  if (!isRecord(body) || body.ok !== true) {
    const message = isRecord(body) && typeof body.error === "string" ? body.error : "加分失败"
    throw new ApiError(`词表接口：${message}`, 502)
  }
}

export async function increaseWordPoints(word: string, delta: number): Promise<number> {
  const current = await getWordPoints(word)
  const next = current + delta
  await setWordPoints(word, next)
  return next
}
