import type { RateId, TtsVoice } from "@/lib/speech"

export type Award = 5 | 10 | 15

export const AWARD_LABEL: Record<Award, string> = {
  5: "生疏",
  10: "可以",
  15: "很熟",
}

export type RoundWord = {
  word: string
  points: number
}

export type Line = {
  id: string
  word: string
  en: string
  zh: string
  revealed: boolean
  award: Award | null
}

export type Round = {
  id: string
  createdAt: string
  words: RoundWord[]
  lines: Line[]
  cursor: number
}

export type RoundSummary = {
  id: string
  createdAt: string
  words: RoundWord[]
  answered: number
  total: number
  gained: number
}

export type AppSettings = {
  autoSpeak: boolean
  voice: string
  rate: RateId
}

export type RoundResponse = { round: Round }
export type RoundListResponse = { rounds: RoundSummary[] }
export type SettingsResponse = { settings: AppSettings }
export type VoicesResponse = { voices: TtsVoice[] }

export function isAward(value: number): value is Award {
  return value === 5 || value === 10 || value === 15
}
