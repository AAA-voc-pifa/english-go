"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { KeyButton } from "@/components/key-button"
import { requestJson } from "@/lib/http"
import type { QuizResponse } from "@/lib/types"

export function CreateQuizButton({
  label,
  tone = "solid",
  shortcut,
}: {
  label: string
  tone?: "solid" | "quiet"
  shortcut?: string
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    if (pending) return
    setPending(true)
    setError(null)
    try {
      const data = await requestJson<QuizResponse>("/api/quizzes", { method: "POST" })
      router.push(`/q/${data.quiz.id}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "出题失败")
      setPending(false)
    }
  }

  return (
    <div className="relative flex flex-col items-start">
      <KeyButton shortcut={shortcut} onClick={() => void create()} disabled={pending} tone={tone}>
        {pending ? "正在出题" : label}
      </KeyButton>
      {error ? (
        <p role="alert" className="absolute top-full left-0 z-10 mt-2 w-64 text-sm leading-6 text-accent">
          {error}
        </p>
      ) : null}
    </div>
  )
}
