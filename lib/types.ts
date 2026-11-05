import type { RateId, TtsVoice } from "@/lib/speech"

export type Award = 5 | 10 | 15

export type QuizWord = {
  word: string
  points: number
}

export type QuizQuestion = {
  id: string
  word: string
  en: string
  zh: string
  revealed: boolean
  award: Award | null
}

export type Quiz = {
  id: string
  createdAt: string
  words: QuizWord[]
  questions: QuizQuestion[]
  cursor: number
}

export type QuizSummary = {
  id: string
  createdAt: string
  words: QuizWord[]
  answered: number
  total: number
  gained: number
}

export type AppSettings = {
  autoSpeak: boolean
  voice: string
  rate: RateId
}

export type QuizResponse = { quiz: Quiz }
export type QuizListResponse = { quizzes: QuizSummary[] }
export type SettingsResponse = { settings: AppSettings }
export type VoicesResponse = { voices: TtsVoice[] }

export function isAward(value: number): value is Award {
  return value === 5 || value === 10 || value === 15
}
