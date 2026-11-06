"use client"

import { useEffect, useRef, useState } from "react"
import { DeckRail } from "@/components/deck-rail"
import { PracticeDock } from "@/components/practice-dock"
import { ResultSheet } from "@/components/result-sheet"
import { Sentence } from "@/components/sentence"
import { StatusBlock } from "@/components/status-block"
import { prefetchLine, setSpeechCacheKey, speechLabel, useLineAudio } from "@/hooks/use-line-audio"
import { requestJson } from "@/lib/http"
import type { AppSettings, Award, Deck, DeckCard, DeckResponse, SettingsResponse } from "@/lib/types"

function keepCursor(current: Deck | null, next: Deck): Deck {
  if (!current || current.id !== next.id) return next
  return { ...next, cursor: current.cursor }
}

function mergeAwards(current: Deck, incoming: Deck): Deck {
  if (current.id !== incoming.id) return incoming
  const local = new Map(current.cards.map((card) => [card.id, card]))
  return {
    ...incoming,
    cards: incoming.cards.map((card) => {
      const previous = local.get(card.id)
      if (!previous) return card
      return {
        ...card,
        award: previous.award ?? card.award,
        starred: previous.starred || card.starred,
      }
    }),
  }
}

function takeScores(current: Deck, incoming: Deck): Deck {
  if (current.id !== incoming.id) return current
  const cardPoints = new Map(incoming.cards.map((card) => [card.id, card.points]))
  const groupPoints = new Map(incoming.groups.map((group) => [group.key, group.points]))
  return {
    ...current,
    groups: current.groups.map((group) => ({
      ...group,
      points: groupPoints.get(group.key) ?? group.points,
    })),
    cards: current.cards.map((card) => ({
      ...card,
      points: cardPoints.get(card.id) ?? card.points,
    })),
  }
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

export function DeckSession({
  id,
  kind,
  view = "deck",
}: {
  id: string
  kind: "practice" | "review"
  view?: "deck" | "sentence"
}) {
  const [deck, setDeck] = useState<Deck | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [starPending, setStarPending] = useState(false)
  const [notice, setNotice] = useState<{ id: number; message: string } | null>(null)
  const savedCursor = useRef<number | null>(null)
  const scoring = useRef(new Set<string>())
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
  const nextId = deck && view !== "sentence" && !finished ? (deck.cards[deck.cursor + 1]?.id ?? null) : null

  useEffect(() => {
    if (!settings) return
    setSpeechCacheKey(`${settings.voice}|${settings.rate}`)
  }, [settings])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 5000)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    return () => {
      stop()
    }
  }, [finished, cardId, stop])

  useEffect(() => {
    if (view === "sentence" || !cardId || !settings?.autoSpeak || finished) return
    const timer = window.setTimeout(() => {
      void play(cardId)
    }, 0)
    return () => {
      window.clearTimeout(timer)
    }
  }, [cardId, finished, play, settings?.autoSpeak, view])

  useEffect(() => {
    if (!nextId || !settings) return
    prefetchLine(nextId)
  }, [nextId, settings])

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
      setDeck((latest) => (latest ? keepCursor(latest, mergeAwards(latest, data.deck)) : latest))
    } catch (error) {
      setDeck(current)
      setActionError(error instanceof Error ? error.message : "Couldn't save the translation")
    }
  }

  function award(item: DeckCard, points: Award) {
    if (item.award !== null || scoring.current.has(item.id)) return
    scoring.current.add(item.id)
    setActionError(null)
    setDeck((current) => {
      if (!current) return current
      const cards = current.cards.map((entry) => (entry.id === item.id ? { ...entry, award: points } : entry))
      const cursor =
        current.cards[current.cursor]?.id === item.id && current.cursor < cards.length - 1
          ? current.cursor + 1
          : current.cursor
      return { ...current, cards, cursor }
    })
    void requestJson<DeckResponse>(endpoint(kind, id, item.id), {
      method: "PATCH",
      body: JSON.stringify({ award: points }),
    })
      .then((data) => {
        setDeck((latest) => (latest ? takeScores(latest, data.deck) : latest))
      })
      .catch((error: unknown) => {
        setDeck((current) =>
          current
            ? {
                ...current,
                cards: current.cards.map((entry) =>
                  entry.id === item.id && entry.award === points ? { ...entry, award: null } : entry,
                ),
              }
            : current,
        )
        setNotice({
          id: Date.now(),
          message: error instanceof Error ? error.message : "Couldn't save the score",
        })
      })
      .finally(() => {
        scoring.current.delete(item.id)
      })
  }

  async function star(item: DeckCard) {
    if (kind !== "practice" || starPending || item.starred) return
    setStarPending(true)
    setActionError(null)
    setDeck((current) =>
      current
        ? { ...current, cards: current.cards.map((entry) => (entry.id === item.id ? { ...entry, starred: true } : entry)) }
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
              cards: current.cards.map((entry) => (entry.id === item.id ? { ...entry, starred: false } : entry)),
            }
          : current,
      )
      setActionError(error instanceof Error ? error.message : "Couldn't star the sentence")
    } finally {
      setStarPending(false)
    }
  }

  if (loading) return <StatusBlock>Loading…</StatusBlock>
  if (loadError || !deck || !card) {
    return <StatusBlock tone="hot">{loadError ?? "This session is empty"}</StatusBlock>
  }
  if (view === "sentence") {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 py-16">
        <Sentence en={card.en} word={card.word} />
        <p lang="zh-CN" className="mt-6 max-w-2xl text-sm leading-6 text-muted">
          {card.zh}
        </p>
      </main>
    )
  }

  if (finished) {
    return (
      <>
        <ResultSheet
          deck={deck}
          speechTarget={target}
          phase={phase}
          soundError={soundError}
          onSpeak={(lineId) => void play(lineId)}
          onStar={kind === "practice" ? (lineId) => void star(deck.cards.find((item) => item.id === lineId) ?? card) : undefined}
        />
        {notice ? <ScoreNotice message={notice.message} /> : null}
      </>
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
        <article className="flex min-h-[48vh] flex-1 flex-col px-5 py-8 sm:px-8 lg:px-12">
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
        starred={card.starred}
        starPending={starPending}
        onPrev={() => move(deck.cursor - 1)}
        onNext={() => move(deck.cursor + 1)}
        onSpeak={() => void play(card.id)}
        onReveal={() => void toggleReveal(deck, card)}
        onAward={(points) => void award(card, points)}
        onStar={kind === "practice" ? () => void star(card) : undefined}
        scoreLabel={kind === "review" ? "Add points to this sentence" : "Add points to this word"}
      />
      {notice ? <ScoreNotice message={notice.message} /> : null}
    </main>
  )
}

function ScoreNotice({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="fixed bottom-24 left-1/2 z-30 w-[min(24rem,calc(100%-2rem))] -translate-x-1/2 border border-line bg-panel px-4 py-3 text-sm text-hot"
    >
      {message}
    </p>
  )
}
