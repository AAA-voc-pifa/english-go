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
      throw new ApiError("朗读超时了", 504)
    }
    throw new ApiError("语音合成连不上", 502)
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
    throw new ApiError(detail ? `读不到音色：${detail}` : "读不到音色", 502)
  }

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw new ApiError("音色列表不是 JSON", 502)
  }
  if (!Array.isArray(body)) throw new ApiError("音色列表无法识别", 502)

  const voices = body.map(readVoice).filter((item): item is TtsVoice => item !== null)
  if (voices.length === 0) throw new ApiError("音色列表是空的", 502)
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
      throw new ApiError("朗读超时了", 504)
    }
    throw new ApiError("语音合成连不上", 502)
  }

  if (!response.ok || !response.body) {
    const detail = (await response.text().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 180)
    throw new ApiError(detail ? `朗读失败：${detail}` : "朗读失败", 502)
  }

  return new Response(response.body, {
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "audio/mpeg",
      "Cache-Control": "private, max-age=86400",
    },
  })
}
