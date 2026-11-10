"use client"

import { useEffect, useState } from "react"
import { NewRoundButton } from "@/components/new-round-button"
import { Sentence } from "@/components/sentence"
import { StatusBlock } from "@/components/status-block"
import { requestJson } from "@/lib/http"
import type { SentenceListResponse, StarredSentence } from "@/lib/types"

export default function HomePage() {
  const [sentence, setSentence] = useState<StarredSentence | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    requestJson<SentenceListResponse>("/api/sentences?limit=1")
      .then((data) => {
        if (!cancelled) setSentence(data.sentences[0] ?? null)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Couldn't load sentences")
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return <StatusBlock tone="hot">{error}</StatusBlock>
  if (sentence === undefined) return <StatusBlock>Loading…</StatusBlock>
  if (sentence === null) {
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

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 py-16">
      <Sentence en={sentence.en} word={sentence.word} />
      <p lang="zh-CN" className="mt-6 max-w-2xl text-sm leading-6 text-muted">
        {sentence.zh}
      </p>
    </main>
  )
}
