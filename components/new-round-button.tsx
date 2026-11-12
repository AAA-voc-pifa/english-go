"use client"

import { Play, Plus } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useSyncExternalStore } from "react"
import { KeyButton } from "@/components/key-button"
import {
  idlePracticeJob,
  readOpenPracticeId,
  readPracticeJob,
  refreshOpenPractice,
  startPractice,
  subscribeOpenPractice,
  subscribePracticeJob,
} from "@/lib/practice-job"

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
  const router = useRouter()
  const pathname = usePathname()
  const job = useSyncExternalStore(subscribePracticeJob, readPracticeJob, idlePracticeJob)
  const openId = useSyncExternalStore(subscribeOpenPractice, readOpenPracticeId, () => null)
  const held = job.status === "pending" || job.status === "ready"
  const resume = Boolean(openId) && !held

  useEffect(() => {
    void refreshOpenPractice()
  }, [pathname])

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") void refreshOpenPractice()
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onVisible)
    return () => {
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onVisible)
    }
  }, [])

  function onClick() {
    if (held) return
    if (openId) {
      void refreshOpenPractice().then(() => {
        const id = readOpenPracticeId()
        if (id) router.push(`/practice/${id}`)
        else startPractice()
      })
      return
    }
    startPractice()
  }

  const text = job.status === "pending" ? "Writing" : resume ? "Continue" : label
  const Icon = resume ? Play : Plus

  return (
    <KeyButton
      shortcut={shortcut}
      onClick={onClick}
      disabled={held}
      tone={tone}
      className={compact ? "h-10 w-10 px-0 sm:w-auto sm:px-3" : undefined}
    >
      {compact ? <Icon aria-hidden="true" className="size-4 sm:hidden" /> : null}
      <span className={compact ? "max-sm:sr-only" : undefined}>{text}</span>
    </KeyButton>
  )
}
