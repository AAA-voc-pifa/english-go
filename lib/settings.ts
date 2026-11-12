import { ApiError } from "@/lib/api-error"
import { parseDoc, settingsSchema, type SettingsDoc } from "@/lib/db-schema"
import { getDb } from "@/lib/mongo"
import { DEFAULT_RATE, DEFAULT_VOICE, isRate, isVoiceId } from "@/lib/speech"
import type { AppSettings } from "@/lib/types"
import { voiceExists } from "@/lib/tts"
import { validatedCollection } from "@/lib/validated-collection"

const DEFAULTS: AppSettings = {
  autoSpeak: false,
  voice: DEFAULT_VOICE,
  rate: DEFAULT_RATE,
}

async function settings() {
  const db = await getDb()
  return validatedCollection(db.collection<SettingsDoc>("settings"), settingsSchema, "settings")
}

function toSettings(doc: SettingsDoc | null): AppSettings {
  if (!doc) return DEFAULTS
  return {
    autoSpeak: doc.autoSpeak,
    voice: isVoiceId(doc.voice) ? doc.voice : DEFAULT_VOICE,
    rate: isRate(doc.rate) ? doc.rate : DEFAULT_RATE,
  }
}

export async function getSettings(): Promise<AppSettings> {
  const doc = await (await settings()).findOne({ _id: "app" })
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
    if (!isVoiceId(patch.voice)) throw new ApiError("Unknown voice", 400)
    if (!(await voiceExists(patch.voice))) throw new ApiError("Unknown voice", 400)
    next.voice = patch.voice
  }
  if (patch.rate !== undefined) {
    if (!isRate(patch.rate)) throw new ApiError("Unknown rate", 400)
    next.rate = patch.rate
  }

  const doc = parseDoc(
    settingsSchema,
    { _id: "app" as const, autoSpeak: next.autoSpeak, voice: next.voice, rate: next.rate },
    "settings",
  )
  await (await settings()).updateOne(
    { _id: "app" },
    { $set: { autoSpeak: doc.autoSpeak, voice: doc.voice, rate: doc.rate } },
    { upsert: true },
  )
  return next
}
