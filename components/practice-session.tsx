"use client"

import { useEffect, useRef, useState } from "react"
import { PracticeDock } from "@/components/practice-dock"
import { ReviewSheet } from "@/components/review-sheet"
import { Sentence } from "@/components/sentence"
import { StatusBlock } from "@/components/status-block"
import { WordRail } from "@/components/word-rail"
import { speechLabel, useLineAudio } from "@/hooks/use-line-audio"
import { requestJson } from "@/lib/http"
import type { AppSettings, Award, Line, Round, RoundResponse, SettingsResponse } from "@/lib/types"

function keepCursor(current: Round | null, next: Round): Round {
  if (!current || current.id !== next.id) return next
  return { ...next, cursor: current.cursor }
}

function advanceAfterAward(current: Round | null, incoming: Round, lineId: string): Round {
  const merged = keepCursor(current, incoming)
  const showing = merged.lines[merged.cursor]
  if (!showing || showing.id !== lineId || showing.award === null) return merged
  if (merged.cursor >= merged.lines.length - 1) return merged
  return { ...merged, cursor: merged.cursor + 1 }
}

function isFinished(round: Round): boolean {
  return round.lines.length > 0 && round.lines.every((line) => line.award !== null)
}

export function PracticeSession({ id }: { id: string }) {
  const [round, setRound] = useState<Round | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [awardPending, setAwardPending] = useState(false)
  const savedCursor = useRef<number | null>(null)
  const { target, phase, error: soundError, play, stop, dismissError } = useLineAudio()

  useEffect(() => {
    let cancelled = false
    const roundPromise = requestJson<RoundResponse>(`/api/rounds/${id}`)
    const settingsPromise = requestJson<SettingsResponse>("/api/settings").catch(() => null)
    Promise.all([roundPromise, settingsPromise])
      .then(([roundData, settingsData]) => {
        if (cancelled) return
        setRound(roundData.round)
        setSettings(settingsData?.settings ?? null)
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "读不到这组练习")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (!round) return
    if (savedCursor.current === null || savedCursor.current === round.cursor) {
      savedCursor.current = round.cursor
      return
    }
    const cursor = round.cursor
    savedCursor.current = cursor
    void requestJson<RoundResponse>(`/api/rounds/${round.id}`, {
      method: "PATCH",
      body: JSON.stringify({ cursor }),
    }).catch((error: unknown) => {
      setActionError(error instanceof Error ? error.message : "没能记住进度")
    })
  }, [round])

  const line = round?.lines[round.cursor] ?? null
  const finished = round ? isFinished(round) : false
  const lineId = line?.id

  useEffect(() => {
    return () => {
      stop()
    }
  }, [finished, lineId, stop])

  useEffect(() => {
    if (!lineId || !settings?.autoSpeak || finished) return
    const timer = window.setTimeout(() => {
      void play(lineId)
    }, 0)
    return () => {
      window.clearTimeout(timer)
    }
  }, [finished, lineId, play, settings?.autoSpeak])

  function move(nextCursor: number) {
    stop()
    dismissError()
    setActionError(null)
    setRound((current) => {
      if (!current) return current
      if (nextCursor < 0 || nextCursor >= current.lines.length) return current
      if (nextCursor > current.cursor) {
        const showing = current.lines[current.cursor]
        if (!showing || showing.award === null) return current
      }
      return { ...current, cursor: nextCursor }
    })
  }

  async function toggleReveal(current: Round, item: Line) {
    const revealed = !item.revealed
    setActionError(null)
    setRound({
      ...current,
      lines: current.lines.map((entry) => (entry.id === item.id ? { ...entry, revealed } : entry)),
    })
    try {
      const data = await requestJson<RoundResponse>(`/api/rounds/${current.id}/lines/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ revealed }),
      })
      setRound((latest) => keepCursor(latest, data.round))
    } catch (error) {
      setRound(current)
      setActionError(error instanceof Error ? error.message : "没能记下译文状态")
    }
  }

  async function award(item: Line, points: Award) {
    if (awardPending || item.award !== null) return
    setAwardPending(true)
    setActionError(null)
    try {
      const data = await requestJson<RoundResponse>(`/api/rounds/${id}/lines/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ award: points }),
      })
      setRound((latest) => advanceAfterAward(latest, data.round, item.id))
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "加分失败")
    } finally {
      setAwardPending(false)
    }
  }

  if (loading) return <StatusBlock>正在读取练习…</StatusBlock>
  if (loadError || !round || !line) {
    return <StatusBlock tone="hot">{loadError ?? "这组练习是空的"}</StatusBlock>
  }
  if (finished) {
    return (
      <ReviewSheet
        round={round}
        speechTarget={target}
        phase={phase}
        soundError={soundError}
        onSpeak={(nextId) => void play(nextId)}
      />
    )
  }

  const siblings = round.lines.filter((item) => item.word === line.word)
  const place = siblings.findIndex((item) => item.id === line.id) + 1

  return (
    <main className="flex flex-1 flex-col">
      <div className="mx-auto grid w-full max-w-6xl flex-1 lg:grid-cols-[240px_minmax(0,1fr)]">
        <WordRail words={round.words} lines={round.lines} currentLineId={line.id} />
        <article className="flex min-h-[48vh] flex-col px-5 py-8 sm:px-8 lg:px-12">
          <div className="flex items-baseline justify-between gap-4 font-mono text-[11px] tracking-[0.16em] text-muted uppercase">
            <p>
              {line.word} · {place}/{siblings.length}
            </p>
            <p className="tabular-nums">
              {round.cursor + 1} / {round.lines.length}
            </p>
          </div>
          <div className="mt-8">
            <Sentence en={line.en} word={line.word} />
          </div>
          {line.revealed ? (
            <p lang="zh-CN" className="mt-8 max-w-2xl border-t border-line pt-5 text-lg leading-8 text-ink">
              {line.zh}
            </p>
          ) : null}
        </article>
      </div>
      {soundError ? (
        <p role="alert" className="mx-auto w-full max-w-6xl px-5 pb-2 text-sm text-hot">
          {soundError}
        </p>
      ) : null}
      {actionError ? (
        <p role="alert" className="mx-auto w-full max-w-6xl px-5 pb-2 text-sm text-hot">
          {actionError}
        </p>
      ) : null}
      <PracticeDock
        canPrev={round.cursor > 0}
        canNext={line.award !== null && round.cursor < round.lines.length - 1}
        speechLabel={speechLabel(line.id, target, phase)}
        speechPending={phase === "loading"}
        revealed={line.revealed}
        award={line.award}
        awardPending={awardPending}
        onPrev={() => move(round.cursor - 1)}
        onNext={() => move(round.cursor + 1)}
        onSpeak={() => void play(line.id)}
        onReveal={() => void toggleReveal(round, line)}
        onAward={(points) => void award(line, points)}
      />
    </main>
  )
}
