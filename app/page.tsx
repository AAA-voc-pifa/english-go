"use client"

import { useEffect, useState } from "react"
import { NewRoundButton } from "@/components/new-round-button"
import { PracticeSession } from "@/components/practice-session"
import { StatusBlock } from "@/components/status-block"
import { requestJson } from "@/lib/http"
import type { RoundListResponse } from "@/lib/types"

export default function HomePage() {
  const [latestId, setLatestId] = useState<string | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    requestJson<RoundListResponse>("/api/rounds")
      .then((data) => {
        if (!cancelled) setLatestId(data.rounds[0]?.id ?? null)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "读不到练习")
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return <StatusBlock tone="hot">{error}</StatusBlock>
  if (latestId === undefined) return <StatusBlock>正在读取练习…</StatusBlock>
  if (latestId === null) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-5 py-16">
        <div className="max-w-xl">
          <p className="font-mono text-[11px] tracking-[0.2em] text-muted uppercase">Practice</p>
          <h1 className="mt-4 text-5xl leading-[1.05] tracking-tight">三个最生的词，九个句子。</h1>
          <p className="mt-4 max-w-md text-muted">从词表取出 points 最低的三个单词，每个写三句英译中。</p>
        </div>
        <NewRoundButton label="开始练习" />
      </main>
    )
  }

  return <PracticeSession key={latestId} id={latestId} />
}
