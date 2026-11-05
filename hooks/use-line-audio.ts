"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { passwordHeaders } from "@/lib/client-auth"

type Phase = "idle" | "loading" | "playing"
type SpeechAudio = HTMLAudioElement & { objectUrl?: string }

let activeAudio: SpeechAudio | null = null

function stopActive() {
  if (!activeAudio) return
  activeAudio.pause()
  if (activeAudio.objectUrl) URL.revokeObjectURL(activeAudio.objectUrl)
  activeAudio = null
}

export function speechLabel(lineId: string, target: string | null, phase: Phase): string {
  if (target !== lineId || phase === "idle") return "朗读"
  if (phase === "playing") return "播放中"
  return "读取音频"
}

export function useLineAudio() {
  const [target, setTarget] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>("idle")
  const [error, setError] = useState<string | null>(null)
  const token = useRef(0)

  const stop = useCallback(() => {
    token.current += 1
    stopActive()
    setPhase("idle")
  }, [])

  useEffect(() => {
    return () => {
      token.current += 1
      stopActive()
    }
  }, [])

  const dismissError = useCallback(() => setError(null), [])

  const play = useCallback(async (lineId: string) => {
    const next = token.current + 1
    token.current = next
    stopActive()
    setTarget(lineId)
    setPhase("loading")
    setError(null)

    try {
      const response = await fetch(`/api/speak?line=${encodeURIComponent(lineId)}`, {
        headers: passwordHeaders(),
      })
      if (token.current !== next) return
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: unknown } | null
        const message = payload && typeof payload.error === "string" ? payload.error : "这段音频读不出来"
        throw new Error(message)
      }
      const objectUrl = URL.createObjectURL(await response.blob())
      if (token.current !== next) {
        URL.revokeObjectURL(objectUrl)
        return
      }
      const audio: SpeechAudio = new Audio(objectUrl)
      audio.objectUrl = objectUrl
      activeAudio = audio
      audio.addEventListener("ended", () => {
        if (audio.objectUrl) URL.revokeObjectURL(audio.objectUrl)
        audio.objectUrl = undefined
        if (activeAudio !== audio) return
        activeAudio = null
        setPhase("idle")
      })
      audio.addEventListener("error", () => {
        if (activeAudio !== audio) return
        stopActive()
        setPhase("idle")
        setError("这段音频读不出来")
      })
      await audio.play()
      if (token.current !== next) {
        stopActive()
        return
      }
      setPhase("playing")
    } catch (caught) {
      if (token.current !== next) return
      stopActive()
      setPhase("idle")
      setError(caught instanceof Error ? caught.message : "浏览器拦住了播放")
    }
  }, [])

  return {
    target,
    phase,
    error,
    play,
    stop,
    dismissError,
  }
}
