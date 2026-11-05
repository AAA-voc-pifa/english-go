import type { RateId, TtsVoice } from "@/lib/speech"

export type Award = 5 | 10 | 15

export const AWARD_LABEL: Record<Award, string> = {
  5: "Rusty",
  10: "Okay",
  15: "Solid",
}

export type PracticeWord = {
  word: string
  points: number
}

export type PracticeSummary = {
  id: string
  createdAt: string
  words: PracticeWord[]
  answered: number
  total: number
  gained: number
}

export type DeckCard = {
  id: string
  word: string
  en: string
  zh: string
  revealed: boolean
  award: Award | null
  points: number
  starred: boolean
}

export type DeckGroup = {
  key: string
  label: string
  points: number
  cardIds: string[]
}

export type Deck = {
  id: string
  createdAt: string
  cursor: number
  cards: DeckCard[]
  groups: DeckGroup[]
}

export type StarredSentence = {
  id: string
  word: string
  en: string
  zh: string
  points: number
  createdAt: string
}

export type ReviewSummary = {
  id: string
  createdAt: string
  answered: number
  total: number
}

export type AppSettings = {
  autoSpeak: boolean
  voice: string
  rate: RateId
}

export type DeckResponse = { deck: Deck }
export type PracticeListResponse = { practices: PracticeSummary[] }
export type SentenceListResponse = { sentences: StarredSentence[] }
export type ReviewListResponse = { reviews: ReviewSummary[] }
export type SettingsResponse = { settings: AppSettings }
export type VoicesResponse = { voices: TtsVoice[] }

export function isAward(value: number): value is Award {
  return value === 5 || value === 10 || value === 15
}
