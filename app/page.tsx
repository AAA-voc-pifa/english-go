"use client"

import { useEffect, useState } from "react"
import { DeckSession } from "@/components/deck-session"
import { NewRoundButton } from "@/components/new-round-button"
import { StatusBlock } from "@/components/status-block"
import { requestJson } from "@/lib/http"
import type { PracticeListResponse } from "@/lib/types"

export default function HomePage() {
  const [latestId, setLatestId] = useState<string | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    requestJson<PracticeListResponse>("/api/practices")
      .then((data) => {
        if (!cancelled) setLatestId(data.practices[0]?.id ?? null)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Couldn't load practice")
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return <StatusBlock tone="hot">{error}</StatusBlock>
  if (latestId === undefined) return <StatusBlock>Loading…</StatusBlock>
  if (latestId === null) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-5 py-16">
        <div className="max-w-xl">
          <p className="font-mono text-[11px] tracking-[0.2em] text-muted uppercase">Practice</p>
          <h1 className="mt-4 text-4xl leading-[1.05] tracking-tight sm:text-5xl">Three weakest words. Nine sentences.</h1>
          <p className="mt-4 max-w-md text-muted">
            Take the lowest-point words from your list and write three sentences for each.
          </p>
        </div>
        <NewRoundButton label="Start" />
      </main>
    )
  }

  return <DeckSession key={latestId} id={latestId} kind="practice" view="sentence" />
}
