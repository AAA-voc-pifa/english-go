"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { LoadMoreSentinel } from "@/components/load-more-sentinel"
import { requestJson } from "@/lib/http"
import type { MnemonicListResponse, MnemonicSummary } from "@/lib/types"

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

export default function MnemonicsPage() {
  const [mnemonics, setMnemonics] = useState<MnemonicSummary[] | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const loadingMoreRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    requestJson<MnemonicListResponse>("/api/mnemonics?limit=20")
      .then((data) => {
        if (cancelled) return
        setMnemonics(data.mnemonics)
        setNextCursor(data.nextCursor)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Couldn't load mnemonics")
      })
    return () => {
      cancelled = true
    }
  }, [])

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current || !nextCursor) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    setError(null)
    requestJson<MnemonicListResponse>(`/api/mnemonics?limit=20&cursor=${encodeURIComponent(nextCursor)}`)
      .then((data) => {
        setMnemonics((current) => [...(current ?? []), ...data.mnemonics])
        setNextCursor(data.nextCursor)
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "Couldn't load more mnemonics")
      })
      .finally(() => {
        loadingMoreRef.current = false
        setLoadingMore(false)
      })
  }, [nextCursor])

  async function remove(item: MnemonicSummary) {
    setError(null)
    const previous = mnemonics
    const previousCursor = nextCursor
    setMnemonics((current) => current?.filter((entry) => entry.word !== item.word) ?? current)
    try {
      await requestJson(`/api/mnemonics/${encodeURIComponent(item.word)}`, { method: "DELETE" })
    } catch (caught) {
      setMnemonics(previous)
      setNextCursor(previousCursor)
      setError(caught instanceof Error ? caught.message : "Couldn't delete that mnemonic")
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 py-8">
      <div>
        <p className="font-mono text-[11px] tracking-[0.2em] text-muted uppercase">Mnemonics</p>
        <h1 className="mt-2 text-3xl tracking-tight sm:text-4xl">Structured mnemonics</h1>
        <p className="mt-2 text-sm text-muted">Generated during practice. Edit or delete here.</p>
      </div>

      {error ? (
        <p role="alert" className="text-hot">
          {error}
        </p>
      ) : null}
      {mnemonics === null && !error ? (
        <p role="status" className="text-muted">
          Loading…
        </p>
      ) : null}
      {mnemonics?.length === 0 && nextCursor === null ? (
        <p className="text-muted">No mnemonics yet. Generate one from a practice card.</p>
      ) : null}

      <ul className="divide-y divide-line border-y border-line">
        {mnemonics?.map((item) => (
          <li key={item.word} className="flex flex-col gap-2 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <Link
                href={`/mnemonics/${encodeURIComponent(item.word)}`}
                className="font-serif text-lg text-ink hover:text-lime"
              >
                {item.word}
              </Link>
              <span className="font-mono text-xs text-muted tabular-nums">
                {formatWhen(item.updatedAt ?? item.createdAt)}
              </span>
            </div>
            {item.allInOne ? (
              <p lang="zh-CN" className="line-clamp-2 text-sm leading-6 text-muted">
                {item.allInOne}
              </p>
            ) : (
              <p className="text-sm text-muted">No all-in-one line.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/mnemonics/${encodeURIComponent(item.word)}`}
                className="inline-flex h-10 items-center border border-line bg-panel px-3 text-sm text-ink"
              >
                Edit
              </Link>
              <button
                type="button"
                onClick={() => void remove(item)}
                className="inline-flex h-10 items-center border border-line bg-panel px-3 text-sm text-hot"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>

      <LoadMoreSentinel hasMore={nextCursor !== null} loading={loadingMore} onVisible={loadMore} />
    </main>
  )
}
