import { ApiError } from "@/lib/api-error"
import { env } from "@/lib/env"
import type { TtsVoice } from "@/lib/speech"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function ttsDetail(text: string, fallback: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim().slice(0, 180)
  if (!trimmed) return fallback
  try {
    const body: unknown = JSON.parse(trimmed)
    if (isRecord(body) && typeof body.detail === "string" && body.detail) {
      return body.detail
    }
  } catch {
    // plain text
  }
  return trimmed
}

function ttsHeaders(extra?: HeadersInit): HeadersInit {
  return {
    Authentication: env().ttsPassword,
    ...extra,
  }
}

async function ttsFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = new URL(path.replace(/^\//, ""), `${env().ttsBase}/`)
  try {
    return await fetch(url, {
      ...init,
      headers: ttsHeaders(init?.headers),
      cache: "no-store",
      signal: init?.signal ?? AbortSignal.timeout(30_000),
    })
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new ApiError("Speech timed out", 504)
    }
    throw new ApiError("Can't reach speech synthesis", 502)
  }
}

function readVoice(value: unknown): TtsVoice | null {
  if (!isRecord(value) || typeof value.ShortName !== "string" || !value.ShortName) return null
  const locale = typeof value.Locale === "string" ? value.Locale : ""
  const language =
    typeof value.Language === "string" && value.Language
      ? value.Language
      : locale.split("-")[0]?.toLowerCase() || ""
  const gender = typeof value.Gender === "string" ? value.Gender : ""
  const name =
    typeof value.FriendlyName === "string" && value.FriendlyName
      ? value.FriendlyName
      : value.ShortName
  return {
    id: value.ShortName,
    name,
    locale,
    language,
    gender,
  }
}

/** POST /auth — 204 on success; header `Authentication` required. */
export async function verifyTtsPassword(): Promise<void> {
  const response = await ttsFetch("auth", { method: "POST" })
  if (response.status === 204 || response.ok) return
  const detail = ttsDetail(await response.text().catch(() => ""), "")
  if (response.status === 403 || response.status === 401) {
    throw new Error(detail ? `Speech rejected the password: ${detail}` : "Speech rejected the password. Check TTS_API_PASSWORD")
  }
  throw new Error(detail ? `Speech auth failed: ${detail}` : `Speech auth failed (${response.status})`)
}

/** GET /voice — optional gender / locale / language filters. */
export async function listVoices(filter?: {
  gender?: "Female" | "Male"
  locale?: string
  language?: string
}): Promise<TtsVoice[]> {
  const query = new URLSearchParams()
  if (filter?.gender) query.set("gender", filter.gender)
  if (filter?.locale) query.set("locale", filter.locale)
  if (filter?.language) query.set("language", filter.language)
  const suffix = query.size > 0 ? `?${query}` : ""

  const response = await ttsFetch(`voice${suffix}`)
  const text = await response.text()
  if (!response.ok) {
    throw new ApiError(`Couldn't load voices: ${ttsDetail(text, "unknown error")}`, 502)
  }

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw new ApiError("Voice list was not JSON", 502)
  }
  if (!Array.isArray(body)) throw new ApiError("Voice list was unreadable", 502)

  const voices = body.map(readVoice).filter((item): item is TtsVoice => item !== null)
  if (voices.length === 0) throw new ApiError("Voice list is empty", 502)
  return voices
}

export async function voiceExists(id: string): Promise<boolean> {
  const voices = await listVoices()
  return voices.some((item) => item.id === id)
}

/** GET /tts — streaming MP3; `rate` like `+0%` (optional upstream, default +0%). */
export async function synthesize(text: string, speech: { voice: string; rate: string }): Promise<Response> {
  const url = new URL("tts", `${env().ttsBase}/`)
  url.searchParams.set("text", text)
  url.searchParams.set("voice", speech.voice)
  url.searchParams.set("rate", speech.rate)

  let response: Response
  try {
    response = await fetch(url, {
      headers: ttsHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    })
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new ApiError("Speech timed out", 504)
    }
    throw new ApiError("Can't reach speech synthesis", 502)
  }

  if (!response.ok || !response.body) {
    const detail = ttsDetail(await response.text().catch(() => ""), "Speech failed")
    throw new ApiError(`Speech failed: ${detail}`, 502)
  }

  return new Response(response.body, {
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "audio/mpeg",
      "Cache-Control": "private, max-age=86400",
    },
  })
}
