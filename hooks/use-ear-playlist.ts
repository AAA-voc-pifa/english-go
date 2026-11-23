"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ensureClip, stopSpeech } from "@/hooks/use-line-audio"

const GAP_MS = 400

type SpeechAudio = HTMLAudioElement & { objectUrl?: string }

export type EarTrack = {
  id: string
  word: string
  en: string
  zh: string
}

type Phase = "idle" | "loading" | "playing" | "paused" | "waiting"

function setMediaSession(track: EarTrack | null, playing: boolean) {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return
  if (!track) {
    navigator.mediaSession.metadata = null
    return
  }
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.word,
    artist: "Ear review",
    album: track.en,
  })
  navigator.mediaSession.playbackState = playing ? "playing" : "paused"
}

export function useEarPlaylist(tracks: EarTrack[]) {
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>("idle")
  const [error, setError] = useState<string | null>(null)
  /** Full list passes completed in the current 6-pass segment (0..6). */
  const [passesInSegment, setPassesInSegment] = useState(0)
  const [waitingContinue, setWaitingContinue] = useState(false)

  const token = useRef(0)
  const audioRef = useRef<SpeechAudio | null>(null)
  const gapTimer = useRef<number | null>(null)
  const indexRef = useRef(0)
  const passesRef = useRef(0)
  const waitingRef = useRef(false)
  const tracksRef = useRef(tracks)
  const onPlayedRef = useRef<((track: EarTrack) => void) | null>(null)
  const playAtRef = useRef<(at: number) => Promise<void>>(async () => undefined)

  tracksRef.current = tracks
  indexRef.current = index
  passesRef.current = passesInSegment
  waitingRef.current = waitingContinue

  const clearGap = useCallback(() => {
    if (gapTimer.current !== null) {
      window.clearTimeout(gapTimer.current)
      gapTimer.current = null
    }
  }, [])

  const stopCurrent = useCallback(() => {
    clearGap()
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      if (audio.objectUrl) URL.revokeObjectURL(audio.objectUrl)
      audioRef.current = null
    }
    stopSpeech()
  }, [clearGap])

  const advanceAfterPlay = useCallback(
    (playedIndex: number) => {
      const list = tracksRef.current
      if (list.length === 0) return
      const isLast = playedIndex >= list.length - 1
      if (isLast) {
        const nextPasses = passesRef.current + 1
        passesRef.current = nextPasses
        setPassesInSegment(nextPasses)
        if (nextPasses >= 6) {
          waitingRef.current = true
          setWaitingContinue(true)
          setPhase("waiting")
          setMediaSession(list[playedIndex] ?? null, false)
          return
        }
        indexRef.current = 0
        setIndex(0)
        gapTimer.current = window.setTimeout(() => {
          gapTimer.current = null
          void playAtRef.current(0)
        }, GAP_MS)
        return
      }
      const next = playedIndex + 1
      indexRef.current = next
      setIndex(next)
      gapTimer.current = window.setTimeout(() => {
        gapTimer.current = null
        void playAtRef.current(next)
      }, GAP_MS)
    },
    [],
  )

  const playAt = useCallback(
    async (at: number) => {
      const list = tracksRef.current
      const track = list[at]
      if (!track || waitingRef.current) return

      const next = token.current + 1
      token.current = next
      stopCurrent()
      setIndex(at)
      indexRef.current = at
      setPhase("loading")
      setError(null)
      setMediaSession(track, false)

      try {
        const blob = await ensureClip(track.id)
        if (token.current !== next || waitingRef.current) return
        const objectUrl = URL.createObjectURL(blob)
        if (token.current !== next || waitingRef.current) {
          URL.revokeObjectURL(objectUrl)
          return
        }
        const audio: SpeechAudio = new Audio(objectUrl)
        audio.objectUrl = objectUrl
        audioRef.current = audio
        audio.addEventListener("ended", () => {
          if (audio.objectUrl) URL.revokeObjectURL(audio.objectUrl)
          audio.objectUrl = undefined
          if (audioRef.current !== audio) return
          audioRef.current = null
          if (token.current !== next) return
          setPhase("idle")
          onPlayedRef.current?.(track)
          advanceAfterPlay(at)
        })
        audio.addEventListener("error", () => {
          if (audioRef.current !== audio) return
          stopCurrent()
          setPhase("idle")
          setError("Couldn't read this sentence")
        })
        await audio.play()
        if (token.current !== next) {
          stopCurrent()
          return
        }
        setPhase("playing")
        setMediaSession(track, true)
      } catch (caught) {
        if (token.current !== next) return
        stopCurrent()
        setPhase("idle")
        setError(caught instanceof Error ? caught.message : "The browser blocked playback")
      }
    },
    [advanceAfterPlay, stopCurrent],
  )

  playAtRef.current = playAt

  const prefetchAll = useCallback(() => {
    for (const track of tracksRef.current) {
      void ensureClip(track.id).catch(() => undefined)
    }
  }, [])

  const start = useCallback(() => {
    waitingRef.current = false
    setWaitingContinue(false)
    passesRef.current = 0
    setPassesInSegment(0)
    indexRef.current = 0
    setIndex(0)
    prefetchAll()
    void playAt(0)
  }, [playAt, prefetchAll])

  const continueAfterWait = useCallback(() => {
    if (!waitingRef.current) return
    waitingRef.current = false
    setWaitingContinue(false)
    passesRef.current = 0
    setPassesInSegment(0)
    indexRef.current = 0
    setIndex(0)
    void playAt(0)
  }, [playAt])

  const stop = useCallback(() => {
    token.current += 1
    waitingRef.current = false
    setWaitingContinue(false)
    stopCurrent()
    setPhase("idle")
    setMediaSession(null, false)
    if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
      try {
        navigator.mediaSession.setActionHandler("play", null)
        navigator.mediaSession.setActionHandler("pause", null)
        navigator.mediaSession.setActionHandler("stop", null)
      } catch {
        // Some browsers throw when clearing unsupported handlers.
      }
    }
  }, [stopCurrent])

  const setOnPlayed = useCallback((handler: ((track: EarTrack) => void) | null) => {
    onPlayedRef.current = handler
  }, [])

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return
    try {
      navigator.mediaSession.setActionHandler("play", () => {
        if (waitingRef.current) return
        const audio = audioRef.current
        if (audio && audio.paused) {
          void audio.play().then(() => {
            setPhase("playing")
            setMediaSession(tracksRef.current[indexRef.current] ?? null, true)
          })
          return
        }
        if (phase === "idle" || phase === "paused") void playAt(indexRef.current)
      })
      navigator.mediaSession.setActionHandler("pause", () => {
        const audio = audioRef.current
        if (!audio) return
        audio.pause()
        setPhase("paused")
        setMediaSession(tracksRef.current[indexRef.current] ?? null, false)
      })
      navigator.mediaSession.setActionHandler("stop", () => {
        stop()
      })
    } catch {
      // Ignore unsupported Media Session actions.
    }
    return () => {
      try {
        navigator.mediaSession.setActionHandler("play", null)
        navigator.mediaSession.setActionHandler("pause", null)
        navigator.mediaSession.setActionHandler("stop", null)
      } catch {
        // ignore
      }
    }
  }, [phase, playAt, stop])

  useEffect(() => {
    return () => {
      token.current += 1
      clearGap()
      stopCurrent()
      setMediaSession(null, false)
    }
  }, [clearGap, stopCurrent])

  const track = tracks[index] ?? null

  return {
    track,
    index,
    phase,
    error,
    passesInSegment,
    waitingContinue,
    start,
    continueAfterWait,
    stop,
    setOnPlayed,
    dismissError: () => setError(null),
  }
}
