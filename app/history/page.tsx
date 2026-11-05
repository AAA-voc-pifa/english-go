"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { KeyButton } from "@/components/key-button"
import { requestJson } from "@/lib/http"
import type { RoundListResponse, RoundSummary } from "@/lib/types"

function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

export default function HistoryPage() {
  const router = useRouter()
  const [rounds, setRounds] = useState<RoundSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    requestJson<RoundListResponse>("/api/rounds")
      .then((data) => {
        if (!cancelled) setRounds(data.rounds)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "读不到记录")
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 py-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] tracking-[0.2em] text-muted uppercase">Record</p>
          <h1 className="mt-2 text-4xl tracking-tight">做过的练习</h1>
        </div>
        <KeyButton shortcut="b" onClick={() => router.push("/")} tone="ghost">
          回到练习
        </KeyButton>
      </div>

      {error ? <p role="alert" className="text-hot">{error}</p> : null}
      {rounds === null && !error ? (
        <p role="status" className="text-muted">
          正在读取记录…
        </p>
      ) : null}
      {rounds?.length === 0 ? <p className="text-muted">还没有练习。</p> : null}

      <ul className="divide-y divide-line border-y border-line">
        {rounds?.map((round) => {
          const done = round.total > 0 && round.answered === round.total
          return (
            <li key={round.id}>
              <Link href={`/practice/${round.id}`} className="block py-4 transition-colors hover:bg-panel">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="font-serif text-xl">{round.words.map((item) => item.word).join(" · ")}</p>
                  <time dateTime={round.createdAt} className="shrink-0 font-mono text-xs text-muted">
                    {formatWhen(round.createdAt)}
                  </time>
                </div>
                <p className="mt-1 text-sm text-muted">
                  {done ? <span className="text-good">已完成</span> : <span>已打分 {round.answered}/{round.total}</span>}
                  {round.gained > 0 ? ` · 加上 ${round.gained} points` : ""}
                </p>
              </Link>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
