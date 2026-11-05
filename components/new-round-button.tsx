"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { KeyButton } from "@/components/key-button"
import { requestJson } from "@/lib/http"
import type { RoundResponse } from "@/lib/types"

export function NewRoundButton({
  label,
  tone = "lime",
  shortcut,
}: {
  label: string
  tone?: "lime" | "ghost"
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
      const data = await requestJson<RoundResponse>("/api/rounds", { method: "POST" })
      router.push(`/practice/${data.round.id}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "出题失败")
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <KeyButton shortcut={shortcut} onClick={() => void create()} disabled={pending} tone={tone}>
        {pending ? "正在出题" : label}
      </KeyButton>
      {error ? (
        <p role="alert" className="max-w-xs text-sm leading-6 text-hot">
          {error}
        </p>
      ) : null}
    </div>
  )
}
