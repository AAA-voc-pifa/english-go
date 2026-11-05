export const RATES = [
  { id: "-30%", label: "Slow" },
  { id: "-15%", label: "Slower" },
  { id: "+0%", label: "Normal" },
  { id: "+15%", label: "Faster" },
  { id: "+30%", label: "Fast" },
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
