"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { KeyButton } from "@/components/key-button"
import { requestJson } from "@/lib/http"
import type { PracticeListResponse, PracticeSummary } from "@/lib/types"

function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

export default function HistoryPage() {
  const router = useRouter()
  const [practices, setPractices] = useState<PracticeSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    requestJson<PracticeListResponse>("/api/practices")
      .then((data) => {
        if (!cancelled) setPractices(data.practices)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Couldn't load history")
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 py-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] tracking-[0.2em] text-muted uppercase">History</p>
          <h1 className="mt-2 text-4xl tracking-tight">Past practices</h1>
        </div>
        <KeyButton shortcut="b" onClick={() => router.push("/")}>
          Back
        </KeyButton>
      </div>

      {error ? (
        <p role="alert" className="text-hot">
          {error}
        </p>
      ) : null}
      {practices === null && !error ? (
        <p role="status" className="text-muted">
          Loading…
        </p>
      ) : null}
      {practices?.length === 0 ? <p className="text-muted">No practices yet.</p> : null}

      <ul className="divide-y divide-line border-y border-line">
        {practices?.map((practice) => {
          const done = practice.total > 0 && practice.answered === practice.total
          return (
            <li key={practice.id}>
              <Link href={`/practice/${practice.id}`} className="block py-4 transition-colors hover:bg-panel">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="font-serif text-xl">{practice.words.map((item) => item.word).join(" · ")}</p>
                  <time dateTime={practice.createdAt} className="shrink-0 font-mono text-xs text-muted">
                    {formatWhen(practice.createdAt)}
                  </time>
                </div>
                <p className="mt-1 text-sm text-muted">
                  {done ? (
                    <span className="text-good">Done</span>
                  ) : (
                    <span>
                      Scored {practice.answered}/{practice.total}
                    </span>
                  )}
                  {practice.gained > 0 ? ` · +${practice.gained} points` : ""}
                </p>
              </Link>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
