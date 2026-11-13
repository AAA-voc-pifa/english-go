"use client"

import { useEffect, useSyncExternalStore } from "react"
import {
  dismissPracticeJob,
  idlePracticeJob,
  readOpenPracticeIds,
  readPracticeJob,
  startPractice,
  subscribeOpenPractice,
  subscribePracticeJob,
} from "@/lib/practice-job"

function DialogButton({
  shortcut,
  tone = "ghost",
  autoFocus = false,
  onClick,
  children,
}: {
  shortcut: string
  tone?: "lime" | "ghost"
  autoFocus?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      autoFocus={autoFocus}
      onClick={onClick}
      aria-keyshortcuts={shortcut.toUpperCase()}
      className={
        tone === "lime"
          ? "inline-flex h-10 items-center justify-center gap-2 border border-lime bg-lime px-4 text-sm font-medium text-lime-ink"
          : "inline-flex h-10 items-center justify-center gap-2 border border-line bg-panel px-4 text-sm"
      }
    >
      {children}
      <kbd className="hidden h-5 min-w-5 place-items-center border border-current/30 px-1 font-mono text-[10px] leading-none sm:inline-grid">
        {shortcut.toUpperCase()}
      </kbd>
    </button>
  )
}

export function PracticeNextDialog({
  practiceId,
  onRest,
  onStartNext,
}: {
  practiceId: string
  onRest: () => void
  /** Close this dialog first, then navigate — keeps global shortcuts alive on the next page. */
  onStartNext: (nextId: string) => void
}) {
  const job = useSyncExternalStore(subscribePracticeJob, readPracticeJob, idlePracticeJob)
  const openIds = useSyncExternalStore(subscribeOpenPractice, readOpenPracticeIds, () => [])

  const nextId =
    openIds.find((id) => id !== practiceId) ?? (job.status === "ready" ? job.id : null)
  const canStartNext = nextId !== null && nextId !== practiceId
  const canGenerate = !canStartNext && job.status !== "pending" && job.status !== "ready"

  function startNext() {
    if (!canStartNext || !nextId) return
    dismissPracticeJob()
    onStartNext(nextId)
  }

  function generate() {
    if (!canGenerate) return
    startPractice()
    onRest()
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
      if (event.repeat || event.isComposing || event.key === "Process") return
      const key = event.key.toLowerCase()
      if (key === "n") {
        event.preventDefault()
        if (canStartNext && nextId) {
          dismissPracticeJob()
          onStartNext(nextId)
        } else if (canGenerate) {
          startPractice()
          onRest()
        }
        return
      }
      if (key === "r") {
        event.preventDefault()
        onRest()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [canGenerate, canStartNext, nextId, onRest, onStartNext])

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-bg/80 px-5">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="practice-next-title"
        className="flex w-full max-w-md flex-col gap-4 border border-line bg-panel p-6"
      >
        <h2 id="practice-next-title" className="text-3xl tracking-tight">
          What&apos;s next?
        </h2>
        <p className="text-muted">This practice is done.</p>
        <div className="flex flex-wrap gap-2">
          {canStartNext && nextId ? (
            <DialogButton shortcut="n" tone="lime" autoFocus onClick={startNext}>
              Start next
            </DialogButton>
          ) : null}
          {canGenerate ? (
            <DialogButton shortcut="n" tone="lime" autoFocus onClick={generate}>
              New practice
            </DialogButton>
          ) : null}
          {job.status === "pending" && !canStartNext ? (
            <p className="w-full text-sm text-muted">Writing the next practice…</p>
          ) : null}
          <DialogButton shortcut="r" autoFocus={!canStartNext && !canGenerate} onClick={onRest}>
            Rest
          </DialogButton>
        </div>
      </div>
    </div>
  )
}
