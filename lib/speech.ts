export const RATES = [
  { id: "-30%", label: "慢" },
  { id: "-15%", label: "稍慢" },
  { id: "+0%", label: "正常" },
  { id: "+15%", label: "稍快" },
  { id: "+30%", label: "快" },
] as const

export type RateId = (typeof RATES)[number]["id"]

export const DEFAULT_VOICE = "en-US-AriaNeural"
export const DEFAULT_RATE: RateId = "+0%"

export type TtsVoice = {
  id: string
  name: string
  locale: string
  language: string
  gender: "Female" | "Male" | string
}

export function isRate(value: string): value is RateId {
  return RATES.some((item) => item.id === value)
}

export function isVoiceId(value: string): boolean {
  return /^[A-Za-z]{2,3}(-[A-Za-z0-9]+)+$/.test(value)
}
