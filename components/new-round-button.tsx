"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { KeyButton } from "@/components/key-button"
import { requestJson } from "@/lib/http"
import type { DeckResponse } from "@/lib/types"

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
      const data = await requestJson<DeckResponse>("/api/practices", { method: "POST" })
      router.push(`/practice/${data.deck.id}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't write the sentences")
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <KeyButton shortcut={shortcut} onClick={() => void create()} disabled={pending} tone={tone}>
        {pending ? "Writing" : label}
      </KeyButton>
      {error ? (
        <p role="alert" className="max-w-xs text-sm leading-6 text-hot">
          {error}
        </p>
      ) : null}
    </div>
  )
}
