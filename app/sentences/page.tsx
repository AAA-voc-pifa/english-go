"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Star } from "lucide-react"
import { KeyButton } from "@/components/key-button"
import { Sentence } from "@/components/sentence"
import { requestJson } from "@/lib/http"
import type { DeckResponse, ReviewListResponse, SentenceListResponse, StarredSentence } from "@/lib/types"

export default function SentencesPage() {
  const router = useRouter()
  const [sentences, setSentences] = useState<StarredSentence[] | null>(null)
  const [openReviewId, setOpenReviewId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function load() {
    return Promise.all([
      requestJson<SentenceListResponse>("/api/sentences"),
      requestJson<ReviewListResponse>("/api/reviews"),
    ]).then(([sentenceData, reviewData]) => {
      setSentences(sentenceData.sentences)
      const open = reviewData.reviews.find((review) => review.total > 0 && review.answered < review.total)
      setOpenReviewId(open?.id ?? null)
    })
  }

  useEffect(() => {
    let cancelled = false
    load()
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Couldn't load sentences")
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function review() {
    if (pending) return
    setPending(true)
    setError(null)
    try {
      const data = await requestJson<DeckResponse>("/api/reviews", { method: "POST" })
      router.push(`/review/${data.deck.id}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't start a review")
      setPending(false)
    }
  }

  async function remove(sentence: StarredSentence) {
    setError(null)
    const previous = sentences
    setSentences((current) => current?.filter((item) => item.id !== sentence.id) ?? current)
    try {
      await requestJson(`/api/sentences/${sentence.id}`, { method: "DELETE" })
    } catch (caught) {
      setSentences(previous)
      setError(caught instanceof Error ? caught.message : "Couldn't remove that sentence")
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] tracking-[0.2em] text-muted uppercase">Favourites</p>
          <h1 className="mt-2 text-4xl tracking-tight">Starred sentences</h1>
          <p className="mt-2 text-sm text-muted">Lowest score first. Sentence points start at zero.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {openReviewId ? (
            <KeyButton shortcut="b" onClick={() => router.push(`/review/${openReviewId}`)}>
              Continue
            </KeyButton>
          ) : null}
          <KeyButton onClick={() => void review()} disabled={pending || sentences?.length === 0} tone="lime">
            {pending ? "Starting" : "Review"}
          </KeyButton>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-hot">
          {error}
        </p>
      ) : null}
      {sentences === null && !error ? (
        <p role="status" className="text-muted">
          Loading…
        </p>
      ) : null}
      {sentences?.length === 0 ? <p className="text-muted">Star a sentence during practice.</p> : null}

      <ol className="divide-y divide-line border-y border-line">
        {sentences?.map((sentence) => (
          <li key={sentence.id} className="flex flex-col gap-2 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="inline-flex items-center gap-2 font-serif text-lg">
                <Star aria-hidden="true" className="size-4 fill-current text-lime" />
                {sentence.word}
              </span>
              <span className="font-mono text-xs text-muted tabular-nums">{sentence.points} pts</span>
            </div>
            <Sentence en={sentence.en} word={sentence.word} size="review" />
            <p lang="zh-CN" className="text-sm leading-6 text-muted">
              {sentence.zh}
            </p>
            <button
              type="button"
              onClick={() => void remove(sentence)}
              className="inline-flex h-8 items-center self-start border border-line bg-panel px-3 text-xs text-ink"
            >
              Remove
            </button>
          </li>
        ))}
      </ol>
    </main>
  )
}
