"use client"

import { useEffect, useState } from "react"
import { CreateQuizButton } from "@/components/create-quiz-button"
import { QuizPlayer } from "@/components/quiz-player"
import { requestJson } from "@/lib/http"
import type { QuizListResponse } from "@/lib/types"

export default function HomePage() {
  const [latestId, setLatestId] = useState<string | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    requestJson<QuizListResponse>("/api/quizzes")
      .then((data) => {
        if (!cancelled) setLatestId(data.quizzes[0]?.id ?? null)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "读不到练习")
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 py-10">
        <p role="alert" className="text-accent">
          {error}
        </p>
      </main>
    )
  }

  if (latestId === undefined) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 py-10">
        <p role="status" className="text-muted">
          正在读取练习…
        </p>
      </main>
    )
  }

  if (latestId === null) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-5 py-16">
        <div className="max-w-xl">
          <p className="text-xs tracking-[0.22em] text-muted uppercase">翻译练习</p>
          <h1 className="mt-3 font-serif text-5xl leading-tight tracking-tight text-ink italic">
            把最生的三个词，写成九个句子。
          </h1>
        </div>
        <CreateQuizButton label="开始练习" />
      </main>
    )
  }

  return <QuizPlayer key={latestId} id={latestId} />
}
