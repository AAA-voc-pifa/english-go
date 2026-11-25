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

function serviceOrigin(hostEnv: string, portEnv: string): string {
  return `http://${required(hostEnv)}:${port(portEnv)}`
}

export function env() {
  return {
    mongodbUri: required("MONGODB_URI"),
    myVocBase: serviceOrigin("MY_VOC_API_HOST", "MY_VOC_API_PORT"),
    myVocPassword: required("MY_VOC_API_PASSWORD"),
    llm4vocBase: serviceOrigin("LLM4VOC_API_HOST", "LLM4VOC_API_PORT"),
    llm4vocPassword: required("LLM4VOC_API_PASSWORD"),
    ttsBase: serviceOrigin("TTS_API_HOST", "TTS_API_PORT"),
    ttsPassword: required("TTS_API_PASSWORD"),
    appPassword: required("APP_PASSWORD"),
  }
}
