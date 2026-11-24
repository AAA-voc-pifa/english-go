"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
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
  const [query, setQuery] = useState("")
  const [submitted, setSubmitted] = useState("")
  const [mnemonics, setMnemonics] = useState<MnemonicSummary[] | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [confirmWord, setConfirmWord] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const loadingMoreRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    setMnemonics(null)
    setNextCursor(null)
    setConfirmWord(null)
    setError(null)
    const params = new URLSearchParams({ limit: "20" })
    if (submitted) params.set("q", submitted)
    requestJson<MnemonicListResponse>(`/api/mnemonics?${params}`)
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
  }, [submitted])

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current || !nextCursor) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    setError(null)
    const params = new URLSearchParams({
      limit: "20",
      cursor: nextCursor,
    })
    if (submitted) params.set("q", submitted)
    requestJson<MnemonicListResponse>(`/api/mnemonics?${params}`)
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
  }, [nextCursor, submitted])

  function runSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(query.trim())
  }

  async function remove(item: MnemonicSummary) {
    if (confirmWord !== item.word) {
      setConfirmWord(item.word)
      return
    }
    if (deleting) return
    setDeleting(true)
    setError(null)
    const previous = mnemonics
    const previousCursor = nextCursor
    setMnemonics((current) => current?.filter((entry) => entry.word !== item.word) ?? current)
    setConfirmWord(null)
    try {
      await requestJson(`/api/mnemonics/${encodeURIComponent(item.word)}`, { method: "DELETE" })
    } catch (caught) {
      setMnemonics(previous)
      setNextCursor(previousCursor)
      setError(caught instanceof Error ? caught.message : "Couldn't delete that mnemonic")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl tracking-tight sm:text-4xl">English Go Mnemonic</h1>
        <Link href="/" className="text-sm text-muted hover:text-ink">
          Home
        </Link>
      </div>

      <form onSubmit={runSearch} className="flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setConfirmWord(null)
          }}
          placeholder="Search word or all-in-one"
          spellCheck={false}
          className="min-h-11 min-w-0 flex-1 border border-line bg-panel px-3 text-base text-ink sm:min-h-10 sm:text-sm"
        />
        <button
          type="submit"
          className="inline-flex h-11 shrink-0 items-center border border-lime bg-lime px-4 text-sm font-medium text-lime-ink sm:h-10"
        >
          Search
        </button>
        {submitted ? (
          <button
            type="button"
            onClick={() => {
              setQuery("")
              setSubmitted("")
            }}
            className="inline-flex h-11 shrink-0 items-center border border-line bg-panel px-3 text-sm text-ink sm:h-10"
          >
            Clear
          </button>
        ) : null}
      </form>

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
        <p className="text-muted">{submitted ? "No matches." : "No mnemonics yet."}</p>
      ) : null}

      <ul className="divide-y divide-line border-y border-line">
        {mnemonics?.map((item) => (
          <li key={item.word} className="flex flex-col gap-3 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <Link
                href={`/mnemonics/${encodeURIComponent(item.word)}`}
                className="font-serif text-xl text-ink hover:text-lime"
              >
                {item.word}
              </Link>
              <span className="shrink-0 font-mono text-xs text-muted tabular-nums">
                {formatWhen(item.updatedAt ?? item.createdAt)}
              </span>
            </div>
            {item.allInOne ? (
              <p lang="zh-CN" className="line-clamp-2 text-sm leading-6 text-muted">
                {item.allInOne}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/mnemonics/${encodeURIComponent(item.word)}`}
                className="inline-flex h-10 items-center border border-line bg-panel px-3 text-sm text-ink"
              >
                Edit
              </Link>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void remove(item)}
                className="inline-flex h-10 items-center border border-line bg-panel px-3 text-sm text-hot disabled:opacity-40"
              >
                {confirmWord === item.word ? "Confirm delete" : "Delete"}
              </button>
              {confirmWord === item.word ? (
                <button
                  type="button"
                  onClick={() => setConfirmWord(null)}
                  className="inline-flex h-10 items-center px-2 text-sm text-muted"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <LoadMoreSentinel hasMore={nextCursor !== null} loading={loadingMore} onVisible={loadMore} />
    </main>
  )
}
