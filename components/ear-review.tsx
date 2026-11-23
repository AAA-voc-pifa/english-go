"use client"

import { useEffect, useRef, useState } from "react"
import { KeyButton } from "@/components/key-button"
import { Sentence } from "@/components/sentence"
import { useEarPlaylist, type EarTrack } from "@/hooks/use-ear-playlist"
import { requestJson } from "@/lib/http"
import type { DeckCard } from "@/lib/types"

const PASSES_PER_SEGMENT = 6

/** Buffer in tenths of a point to avoid 0.2*5 float drift. */
function flushPending(
  pending: Map<string, number>,
  word: string,
  creditTenths: number,
): { next: Map<string, number>; write: number } {
  const next = new Map(pending)
  const total = (next.get(word) ?? 0) + creditTenths
  if (total >= 10) {
    const write = Math.floor(total / 10)
    const remainder = total % 10
    if (remainder > 0) next.set(word, remainder)
    else next.delete(word)
    return { next, write }
  }
  next.set(word, total)
  return { next, write: 0 }
}

export function EarReview({ cards, onExit }: { cards: DeckCard[]; onExit: () => void }) {
  const tracks: EarTrack[] = cards.map((card) => ({
    id: card.id,
    word: card.word,
    en: card.en,
    zh: card.zh,
  }))
  const {
    track,
    phase,
    error,
    passesInSegment,
    waitingContinue,
    start,
    continueAfterWait,
    stop,
    setOnPlayed,
    dismissError,
  } = useEarPlaylist(tracks)

  /** Display credit per play; buffer uses tenths (5 or 2). */
  const [credit, setCredit] = useState(0.5)
  const [flushError, setFlushError] = useState<string | null>(null)
  const pending = useRef(new Map<string, number>())
  const creditTenthsRef = useRef(5)
  const started = useRef(false)

  useEffect(() => {
    setOnPlayed((played) => {
      const { next, write } = flushPending(pending.current, played.word, creditTenthsRef.current)
      pending.current = next
      if (write < 1) return
      void requestJson<{ word: string; points: number }>("/api/words/points", {
        method: "POST",
        body: JSON.stringify({ word: played.word, points: write }),
      }).catch((caught: unknown) => {
        // Roll the integer back into tenths so a later successful flush can retry.
        const rolled = (pending.current.get(played.word) ?? 0) + write * 10
        pending.current.set(played.word, rolled)
        setFlushError(caught instanceof Error ? caught.message : "Couldn't save word points")
      })
    })
    return () => setOnPlayed(null)
  }, [setOnPlayed])

  useEffect(() => {
    if (started.current || tracks.length === 0) return
    started.current = true
    start()
  }, [start, tracks.length])

  useEffect(() => {
    return () => {
      stop()
      pending.current.clear()
    }
  }, [stop])

  function exit() {
    stop()
    pending.current.clear()
    onExit()
  }

  function onContinue() {
    setFlushError(null)
    dismissError()
    setCredit(0.2)
    creditTenthsRef.current = 2
    continueAfterWait()
  }

  const passLabel = waitingContinue
    ? `${PASSES_PER_SEGMENT}/${PASSES_PER_SEGMENT}`
    : `${passesInSegment}/${PASSES_PER_SEGMENT}`

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-[0.18em] text-good uppercase">Ear review</p>
          <h1 className="mt-2 text-3xl tracking-tight">Listen through</h1>
        </div>
        <p className="font-mono text-[11px] text-muted tabular-nums">
          Pass {passLabel} · +{credit} / play
        </p>
      </div>

      {error || flushError ? (
        <p role="alert" className="text-sm text-hot">
          {error ?? flushError}
        </p>
      ) : null}

      {track ? (
        <div className="flex flex-col gap-4 border-y border-line py-6">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-serif text-2xl">{track.word}</span>
            <span className="font-mono text-xs text-muted uppercase">
              {waitingContinue ? "Paused" : phase === "loading" ? "Loading" : phase === "playing" ? "Playing" : phase}
            </span>
          </div>
          <Sentence en={track.en} word={track.word} size="review" />
          <p lang="zh-CN" className="text-sm leading-6 text-muted">
            {track.zh}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted">No sentences in this review.</p>
      )}

      <div className="flex flex-wrap gap-2">
        {waitingContinue ? (
          <KeyButton tone="lime" shortcut="c" autoFocus onClick={onContinue}>
            Continue
          </KeyButton>
        ) : null}
        <KeyButton shortcut="x" onClick={exit}>
          Exit
        </KeyButton>
      </div>
    </main>
  )
}
