import { ApiError } from "@/lib/api-error"

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new ApiError(`Missing ${name}`, 500)
  return value
}

function port(name: string): number {
  const raw = required(name)
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new ApiError(`Invalid ${name}`, 500)
  }
  return value
}

function localOrigin(portNumber: number): string {
  return `http://127.0.0.1:${portNumber}`
}

export function env() {
  return {
    mongodbUri: required("MONGODB_URI"),
    vocBase: localOrigin(port("VOC_API_PORT")),
    questionBase: localOrigin(port("QUESTION_API_PORT")),
    ttsBase: localOrigin(port("TTS_API_PORT")),
    ttsPassword: required("TTS_API_PASSWORD"),
    appPassword: required("APP_PASSWORD"),
  }
}
