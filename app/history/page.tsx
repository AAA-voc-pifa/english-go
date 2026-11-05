"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { KeyButton } from "@/components/key-button"
import { requestJson } from "@/lib/http"
import type { QuizListResponse, QuizSummary } from "@/lib/types"

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
  const [quizzes, setQuizzes] = useState<QuizSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    requestJson<QuizListResponse>("/api/quizzes")
      .then((data) => {
        if (!cancelled) setQuizzes(data.quizzes)
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
          <p className="text-xs tracking-[0.22em] text-muted uppercase">记录</p>
          <h1 className="mt-2 font-serif text-4xl italic tracking-tight">做过的练习</h1>
        </div>
        <KeyButton shortcut="b" onClick={() => router.push("/")} tone="quiet">
          回到练习
        </KeyButton>
      </div>

      {error ? (
        <p role="alert" className="text-accent">
          {error}
        </p>
      ) : null}
      {quizzes === null && !error ? (
        <p role="status" className="text-muted">
          正在读取记录…
        </p>
      ) : null}
      {quizzes?.length === 0 ? <p className="text-muted">还没有练习。</p> : null}

      <ul className="flex flex-col gap-3">
        {quizzes?.map((quiz) => (
          <li key={quiz.id}>
            <Link
              href={`/q/${quiz.id}`}
              className="block rounded-3xl border border-line bg-card px-5 py-4 transition-colors hover:border-ink/30"
            >
              <div className="flex items-baseline justify-between gap-4">
                <p className="font-serif text-xl italic">{quiz.words.map((item) => item.word).join(" · ")}</p>
                <time dateTime={quiz.createdAt} className="shrink-0 text-sm text-muted">
                  {formatWhen(quiz.createdAt)}
                </time>
              </div>
              <p className="mt-2 text-sm text-muted">
                {quiz.total > 0 && quiz.answered === quiz.total ? (
                  <span className="text-good">已完成</span>
                ) : (
                  <span>
                    未完成 · 已打分 {quiz.answered}/{quiz.total}
                  </span>
                )}
                {quiz.gained > 0 ? ` · 加上 ${quiz.gained} points` : ""}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
