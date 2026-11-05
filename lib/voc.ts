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
      throw new ApiError("The word list timed out", 504)
    }
    throw new ApiError("Can't reach the word list", 502)
  }

  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiError(vocMessage(body, response.status), 502)
  }
  return body
}

function vocMessage(body: unknown, status: number): string {
  if (isRecord(body) && typeof body.error === "string" && body.error) {
    return `Word list: ${body.error}`
  }
  if (status === 401) return "The word list rejected the password. Check VOC_API_PASSWORD"
  return `Word list failed (${status})`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function readWord(value: unknown): VocWord {
  if (!isRecord(value) || typeof value.word !== "string" || typeof value.points !== "number") {
    throw new ApiError("The word list response was unreadable", 502)
  }
  return { word: value.word, points: value.points }
}

export async function verifyVocPassword(): Promise<void> {
  let response: Response
  try {
    response = await fetch(vocUrl("auth"), {
      method: "GET",
      headers: { Authentication: env().vocPassword },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    })
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error("Word list auth timed out")
    }
    throw new Error("Can't reach the word list")
  }

  const body: unknown = await response.json().catch(() => null)
  if (response.ok && isRecord(body) && body.ok === true) return
  if (response.status === 401 || (isRecord(body) && body.ok === false)) {
    throw new Error("VOC_API_PASSWORD was rejected")
  }
  throw new Error(`Word list auth failed (${response.status})`)
}

export async function listLowest(count: number, points: number): Promise<VocWord[]> {
  const body = await vocFetch(vocUrl("voc", { count: String(count), points: String(points) }), "GET")
  if (!isRecord(body) || body.ok !== true || !Array.isArray(body.data)) {
    throw new ApiError("The word list response was unreadable", 502)
  }
  return body.data.map(readWord)
}

export async function getWordPoints(word: string): Promise<number> {
  const body = await vocFetch(vocUrl(`voc/detail/${encodeURIComponent(word)}`), "GET")
  if (!isRecord(body) || body.ok !== true) {
    const message = isRecord(body) && typeof body.error === "string" ? body.error : "Couldn't read the word score"
    throw new ApiError(`Word list: ${message}`, 502)
  }
  return readWord(body.data).points
}

export async function setWordPoints(word: string, points: number): Promise<void> {
  const body = await vocFetch(
    vocUrl(`voc/points/${encodeURIComponent(word)}`, { points: String(points) }),
    "POST",
  )
  if (!isRecord(body) || body.ok !== true) {
    const message = isRecord(body) && typeof body.error === "string" ? body.error : "Couldn't add points"
    throw new ApiError(`Word list: ${message}`, 502)
  }
}

export async function increaseWordPoints(word: string, delta: number): Promise<number> {
  const current = await getWordPoints(word)
  const next = current + delta
  await setWordPoints(word, next)
  return next
}
