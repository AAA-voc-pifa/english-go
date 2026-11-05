import { ApiError } from "@/lib/api-error"
import { env } from "@/lib/env"
import type { TtsVoice } from "@/lib/speech"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

async function ttsFetch(path: string, init?: RequestInit): Promise<Response> {
  const { ttsBase, ttsPassword } = env()
  const url = new URL(path.replace(/^\//, ""), `${ttsBase}/`)
  try {
    return await fetch(url, {
      ...init,
      headers: {
        password: ttsPassword,
        ...init?.headers,
      },
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

export async function listVoices(): Promise<TtsVoice[]> {
  const response = await ttsFetch("voice")
  const text = await response.text()
  if (!response.ok) {
    const detail = text.replace(/\s+/g, " ").trim().slice(0, 180)
    throw new ApiError(detail ? `Couldn't load voices: ${detail}` : "Couldn't load voices", 502)
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

export async function synthesize(text: string, speech: { voice: string; rate: string }): Promise<Response> {
  const { ttsBase, ttsPassword } = env()
  const url = new URL("tts", `${ttsBase}/`)
  url.searchParams.set("text", text)
  url.searchParams.set("voice", speech.voice)
  url.searchParams.set("rate", speech.rate)

  let response: Response
  try {
    response = await fetch(url, {
      headers: { password: ttsPassword },
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
    const detail = (await response.text().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 180)
    throw new ApiError(detail ? `Speech failed: ${detail}` : "Speech failed", 502)
  }

  return new Response(response.body, {
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "audio/mpeg",
      "Cache-Control": "private, max-age=86400",
    },
  })
}
