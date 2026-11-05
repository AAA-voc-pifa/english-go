import type { Collection } from "mongodb"
import { ApiError } from "@/lib/api-error"
import { getDb } from "@/lib/mongo"
import { DEFAULT_RATE, DEFAULT_VOICE, isRate, isVoiceId } from "@/lib/speech"
import type { AppSettings } from "@/lib/types"
import { voiceExists } from "@/lib/tts"

type SettingsDoc = {
  _id: "app"
  autoSpeak: boolean
  voice: string
  rate: string
}

const DEFAULTS: AppSettings = {
  autoSpeak: false,
  voice: DEFAULT_VOICE,
  rate: DEFAULT_RATE,
}

async function collection(): Promise<Collection<SettingsDoc>> {
  const db = await getDb()
  return db.collection<SettingsDoc>("settings")
}

function toSettings(doc: SettingsDoc | null): AppSettings {
  if (!doc) return DEFAULTS
  return {
    autoSpeak: doc.autoSpeak === true,
    voice: typeof doc.voice === "string" && isVoiceId(doc.voice) ? doc.voice : DEFAULT_VOICE,
    rate: isRate(doc.rate) ? doc.rate : DEFAULT_RATE,
  }
}

export async function getSettings(): Promise<AppSettings> {
  const doc = await (await collection()).findOne({ _id: "app" })
  return toSettings(doc)
}

export async function updateSettings(patch: {
  autoSpeak?: boolean
  voice?: string
  rate?: string
}): Promise<AppSettings> {
  const next: AppSettings = { ...(await getSettings()) }
  if (patch.autoSpeak !== undefined) next.autoSpeak = patch.autoSpeak
  if (patch.voice !== undefined) {
    if (!isVoiceId(patch.voice)) throw new ApiError("没有这个音色", 400)
    if (!(await voiceExists(patch.voice))) throw new ApiError("没有这个音色", 400)
    next.voice = patch.voice
  }
  if (patch.rate !== undefined) {
    if (!isRate(patch.rate)) throw new ApiError("语速不对", 400)
    next.rate = patch.rate
  }

  await (await collection()).updateOne(
    { _id: "app" },
    { $set: { autoSpeak: next.autoSpeak, voice: next.voice, rate: next.rate } },
    { upsert: true },
  )
  return next
}
