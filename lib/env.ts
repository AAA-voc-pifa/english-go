import { ApiError } from "@/lib/api-error"

function required(name: string): string {
  const value = process.env[name]?.trim()
  console.log('env', name, value)
  if (!value) throw new ApiError(`Missing ${name}`, 500)
  return value
}

function origin(name: string): string {
  return required(name).replace(/\/+$/, "")
}

export function env() {
  return {
    mongodbUri: required("MONGODB_URI"),
    mongodbDb: process.env.MONGODB_DB?.trim() || "english-go",
    vocBase: origin("VOC_API_BASE"),
    vocPassword: required("VOC_API_PASSWORD"),
    questionBase: origin("QUESTION_API_BASE"),
    questionPassword: required("QUESTION_API_PASSWORD"),
    ttsBase: origin("TTS_API_BASE"),
    ttsPassword: required("TTS_API_PASSWORD"),
    appPassword: required("APP_PASSWORD"),
  }
}
