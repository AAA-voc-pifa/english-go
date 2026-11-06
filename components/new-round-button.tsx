"use client"

import { Plus } from "lucide-react"
import { useSyncExternalStore } from "react"
import { KeyButton } from "@/components/key-button"
import { idlePracticeJob, readPracticeJob, startPractice, subscribePracticeJob } from "@/lib/practice-job"

export function NewRoundButton({
  label,
  tone = "lime",
  shortcut,
  compact = false,
}: {
  label: string
  tone?: "lime" | "ghost"
  shortcut?: string
  compact?: boolean
}) {
  const job = useSyncExternalStore(subscribePracticeJob, readPracticeJob, idlePracticeJob)
  const held = job.status === "pending" || job.status === "ready"

  return (
    <KeyButton
      shortcut={shortcut}
      onClick={startPractice}
      disabled={held}
      tone={tone}
      className={compact ? "h-10 w-10 px-0 sm:w-auto sm:px-3" : undefined}
    >
      {compact ? <Plus aria-hidden="true" className="size-4 sm:hidden" /> : null}
      <span className={compact ? "max-sm:sr-only" : undefined}>{job.status === "pending" ? "Writing" : label}</span>
    </KeyButton>
  )
}
