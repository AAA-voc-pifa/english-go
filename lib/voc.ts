import { ApiError } from "@/lib/api-error"
import { env } from "@/lib/env"

export type VocWord = {
  word: string
  points: number
}

export type VocWordDetail = VocWord & {
  addedAt: string
  updatedAt: string
}

function vocUrl(path: string, query?: Record<string, string>): URL {
  const url = new URL(path.replace(/^\//, ""), `${env().myVocBase}/`)
  if (query) {
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
  }
  return url
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/** my-voc: business failure → 200 + `{ ok: false, error }`; bad params → 422. */
function vocMessage(body: unknown, status: number): string {
  if (isRecord(body) && typeof body.error === "string" && body.error) {
    return `Word list: ${body.error}`
  }
  if (isRecord(body) && Array.isArray(body.detail)) {
    const parts = body.detail
      .map((item) => {
        if (!isRecord(item) || typeof item.msg !== "string") return null
        const loc = Array.isArray(item.loc) ? item.loc.filter((part) => part !== "query" && part !== "body").join(".") : ""
        return loc ? `${loc}: ${item.msg}` : item.msg
      })
      .filter((part): part is string => Boolean(part))
    if (parts.length > 0) return `Word list: ${parts.join("; ")}`
  }
  return `Word list failed (${status})`
}

function vocHeaders(): HeadersInit {
  return { Authentication: env().myVocPassword }
}

async function vocFetch(url: URL, method: "GET" | "POST"): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers: vocHeaders(),
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

function readWord(value: unknown): VocWord {
  if (!isRecord(value) || typeof value.word !== "string" || typeof value.points !== "number") {
    throw new ApiError("The word list response was unreadable", 502)
  }
  return { word: value.word, points: value.points }
}

function readWordDetail(value: unknown): VocWordDetail {
  const word = readWord(value)
  if (!isRecord(value) || typeof value.add_at !== "string" || typeof value.update_at !== "string") {
    throw new ApiError("The word list response was unreadable", 502)
  }
  return { ...word, addedAt: value.add_at, updatedAt: value.update_at }
}

function requireOk(body: unknown): asserts body is { ok: true; data: unknown } {
  if (!isRecord(body) || body.ok !== true) {
    throw new ApiError(vocMessage(body, 200), 502)
  }
}

/** POST /auth — `{ ok: true }`; header `Authentication` required. */
export async function verifyVoc(): Promise<void> {
  let response: Response
  try {
    response = await fetch(vocUrl("auth"), {
      method: "POST",
      headers: vocHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    })
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error("Word list timed out")
    }
    throw new Error("Can't reach the word list")
  }

  const body: unknown = await response.json().catch(() => null)
  if (response.ok && isRecord(body) && body.ok === true) return
  if (response.status === 401) {
    throw new Error("Word list rejected the password. Check MY_VOC_API_PASSWORD")
  }
  throw new Error(`Word list check failed (${response.status})`)
}

/** Skip words whose my-voc `update_at` is newer than this (new or just practiced). */
export const PRACTICE_IDLE_SECONDS = 24 * 60 * 60

/**
 * Lowest-points words; my-voc also applies `points` to each (use 0 to reserve via `update_at` only).
 * `idle_seconds` filters by `update_at` age.
 */
export async function listLowest(
  count: number,
  points: number,
  exclude: Iterable<string> = [],
  idleSeconds: number = PRACTICE_IDLE_SECONDS,
): Promise<VocWord[]> {
  const url = vocUrl("voc", {
    count: String(count),
    points: String(points),
    idle_seconds: String(idleSeconds),
  })
  for (const word of exclude) url.searchParams.append("exclude", word)
  const body = await vocFetch(url, "GET")
  requireOk(body)
  if (!Array.isArray(body.data)) {
    throw new ApiError("The word list response was unreadable", 502)
  }
  return body.data.map(readWord)
}

export async function listAllWords(): Promise<VocWordDetail[]> {
  const body = await vocFetch(vocUrl("voc/all"), "GET")
  requireOk(body)
  if (!Array.isArray(body.data)) {
    throw new ApiError("The word list response was unreadable", 502)
  }
  return body.data.map(readWordDetail)
}

export async function getWordPoints(word: string): Promise<number> {
  const body = await vocFetch(vocUrl(`voc/detail/${encodeURIComponent(word)}`), "GET")
  requireOk(body)
  return readWord(body.data).points
}

export async function addWordPoints(word: string, points: number): Promise<void> {
  const body = await vocFetch(
    vocUrl(`voc/points/${encodeURIComponent(word)}`, { points: String(points) }),
    "POST",
  )
  requireOk(body)
}

export async function increaseWordPoints(word: string, delta: number): Promise<number> {
  await addWordPoints(word, delta)
  return getWordPoints(word)
}
