"use client"

import { useEffect, useRef, useState } from "react"
import { DeckRail } from "@/components/deck-rail"
import { PracticeDock } from "@/components/practice-dock"
import { ResultSheet } from "@/components/result-sheet"
import { Sentence } from "@/components/sentence"
import { StatusBlock } from "@/components/status-block"
import { speechLabel, useLineAudio } from "@/hooks/use-line-audio"
import { requestJson } from "@/lib/http"
import type { AppSettings, Award, Deck, DeckCard, DeckResponse, SettingsResponse } from "@/lib/types"

function keepCursor(current: Deck | null, next: Deck): Deck {
  if (!current || current.id !== next.id) return next
  return { ...next, cursor: current.cursor }
}

function advanceAfterAward(current: Deck | null, incoming: Deck, cardId: string): Deck {
  const merged = keepCursor(current, incoming)
  const showing = merged.cards[merged.cursor]
  if (!showing || showing.id !== cardId || showing.award === null) return merged
  if (merged.cursor >= merged.cards.length - 1) return merged
  return { ...merged, cursor: merged.cursor + 1 }
}

function isFinished(deck: Deck): boolean {
  return deck.cards.length > 0 && deck.cards.every((card) => card.award !== null)
}

function endpoint(kind: "practice" | "review", id: string, cardId?: string): string {
  if (kind === "practice") {
    return cardId ? `/api/practices/${id}/lines/${cardId}` : `/api/practices/${id}`
  }
  return cardId ? `/api/reviews/${id}/cards/${cardId}` : `/api/reviews/${id}`
}

export function DeckSession({ id, kind }: { id: string; kind: "practice" | "review" }) {
  const [deck, setDeck] = useState<Deck | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [awardPending, setAwardPending] = useState(false)
  const [savePending, setSavePending] = useState(false)
  const savedCursor = useRef<number | null>(null)
  const { target, phase, error: soundError, play, stop, dismissError } = useLineAudio()

  useEffect(() => {
    let cancelled = false
    const deckPromise = requestJson<DeckResponse>(endpoint(kind, id))
    const settingsPromise = requestJson<SettingsResponse>("/api/settings").catch(() => null)
    Promise.all([deckPromise, settingsPromise])
      .then(([deckData, settingsData]) => {
        if (cancelled) return
        setDeck(deckData.deck)
        setSettings(settingsData?.settings ?? null)
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Couldn't load this session")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id, kind])

  useEffect(() => {
    if (!deck) return
    if (savedCursor.current === null || savedCursor.current === deck.cursor) {
      savedCursor.current = deck.cursor
      return
    }
    const cursor = deck.cursor
    savedCursor.current = cursor
    void requestJson<DeckResponse>(endpoint(kind, deck.id), {
      method: "PATCH",
      body: JSON.stringify({ cursor }),
    }).catch((error: unknown) => {
      setActionError(error instanceof Error ? error.message : "Couldn't save your place")
    })
  }, [deck, kind])

  const card = deck?.cards[deck.cursor] ?? null
  const finished = deck ? isFinished(deck) : false
  const cardId = card?.id

  useEffect(() => {
    return () => {
      stop()
    }
  }, [finished, cardId, stop])

  useEffect(() => {
    if (!cardId || !settings?.autoSpeak || finished) return
    const timer = window.setTimeout(() => {
      void play(cardId)
    }, 0)
    return () => {
      window.clearTimeout(timer)
    }
  }, [cardId, finished, play, settings?.autoSpeak])

  function move(nextCursor: number) {
    stop()
    dismissError()
    setActionError(null)
    setDeck((current) => {
      if (!current) return current
      if (nextCursor < 0 || nextCursor >= current.cards.length) return current
      if (nextCursor > current.cursor) {
        const showing = current.cards[current.cursor]
        if (!showing || showing.award === null) return current
      }
      return { ...current, cursor: nextCursor }
    })
  }

  async function toggleReveal(current: Deck, item: DeckCard) {
    const revealed = !item.revealed
    setActionError(null)
    setDeck({
      ...current,
      cards: current.cards.map((entry) => (entry.id === item.id ? { ...entry, revealed } : entry)),
    })
    try {
      const data = await requestJson<DeckResponse>(endpoint(kind, current.id, item.id), {
        method: "PATCH",
        body: JSON.stringify({ revealed }),
      })
      setDeck((latest) => keepCursor(latest, data.deck))
    } catch (error) {
      setDeck(current)
      setActionError(error instanceof Error ? error.message : "Couldn't save the translation")
    }
  }

  async function award(item: DeckCard, points: Award) {
    if (awardPending || item.award !== null) return
    setAwardPending(true)
    setActionError(null)
    try {
      const data = await requestJson<DeckResponse>(endpoint(kind, id, item.id), {
        method: "PATCH",
        body: JSON.stringify({ award: points }),
      })
      setDeck((latest) => advanceAfterAward(latest, data.deck, item.id))
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Couldn't add points")
    } finally {
      setAwardPending(false)
    }
  }

  async function save(item: DeckCard) {
    if (kind !== "practice" || savePending || item.saved) return
    setSavePending(true)
    setActionError(null)
    setDeck((current) =>
      current
        ? { ...current, cards: current.cards.map((entry) => (entry.id === item.id ? { ...entry, saved: true } : entry)) }
        : current,
    )
    try {
      await requestJson("/api/sentences", {
        method: "POST",
        body: JSON.stringify({ lineId: item.id }),
      })
    } catch (error) {
      setDeck((current) =>
        current
          ? {
              ...current,
              cards: current.cards.map((entry) => (entry.id === item.id ? { ...entry, saved: false } : entry)),
            }
          : current,
      )
      setActionError(error instanceof Error ? error.message : "Couldn't save the sentence")
    } finally {
      setSavePending(false)
    }
  }

  if (loading) return <StatusBlock>Loading…</StatusBlock>
  if (loadError || !deck || !card) {
    return <StatusBlock tone="hot">{loadError ?? "This session is empty"}</StatusBlock>
  }
  if (finished) {
    return (
      <ResultSheet
        deck={deck}
        speechTarget={target}
        phase={phase}
        soundError={soundError}
        onSpeak={(nextId) => void play(nextId)}
        onSave={kind === "practice" ? (nextId) => void save(deck.cards.find((item) => item.id === nextId) ?? card) : undefined}
      />
    )
  }

  const siblings = deck.cards.filter((item) =>
    kind === "review" ? item.id === card.id : item.word === card.word,
  )
  const place = siblings.findIndex((item) => item.id === card.id) + 1

  return (
    <main className="flex flex-1 flex-col">
      <div className="mx-auto grid w-full max-w-6xl flex-1 lg:grid-cols-[240px_minmax(0,1fr)]">
        <DeckRail groups={deck.groups} cards={deck.cards} currentId={card.id} />
        <article className="flex min-h-[48vh] flex-col px-5 py-8 sm:px-8 lg:px-12">
          <div className="flex items-baseline justify-between gap-4 font-mono text-[11px] tracking-[0.16em] text-muted uppercase">
            <p>
              {card.word} · {place}/{siblings.length}
            </p>
            <p className="tabular-nums">
              {deck.cursor + 1} / {deck.cards.length}
            </p>
          </div>
          <div className="mt-8">
            <Sentence en={card.en} word={card.word} />
          </div>
          {card.revealed ? (
            <p lang="zh-CN" className="mt-8 max-w-2xl border-t border-line pt-5 text-lg leading-8 text-ink">
              {card.zh}
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
        canPrev={deck.cursor > 0}
        canNext={card.award !== null && deck.cursor < deck.cards.length - 1}
        speechLabel={speechLabel(card.id, target, phase)}
        speechPending={phase === "loading"}
        revealed={card.revealed}
        award={card.award}
        awardPending={awardPending}
        saved={card.saved}
        savePending={savePending}
        onPrev={() => move(deck.cursor - 1)}
        onNext={() => move(deck.cursor + 1)}
        onSpeak={() => void play(card.id)}
        onReveal={() => void toggleReveal(deck, card)}
        onAward={(points) => void award(card, points)}
        onSave={kind === "practice" ? () => void save(card) : undefined}
        scoreLabel={kind === "review" ? "Add points to this sentence" : "Add points to this word"}
      />
    </main>
  )
}
