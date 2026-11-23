"use client"

import { useEffect } from "react"
import { KeyButton } from "@/components/key-button"

export function EarReviewDialog({
  onStart,
  onExit,
}: {
  onStart: () => void
  onExit: () => void
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
      if (event.repeat || event.isComposing || event.key === "Process") return
      const key = event.key.toLowerCase()
      if (key === "e") {
        event.preventDefault()
        onStart()
        return
      }
      if (key === "x" || key === "r") {
        event.preventDefault()
        onExit()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onExit, onStart])

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-bg/80 px-5">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ear-review-title"
        className="flex w-full max-w-md flex-col gap-4 border border-line bg-panel p-6"
      >
        <h2 id="ear-review-title" className="text-3xl tracking-tight">
          Review finished
        </h2>
        <p className="text-muted">Loop the sentences by ear, or leave the result sheet.</p>
        <div className="flex flex-wrap gap-2">
          <KeyButton shortcut="e" tone="lime" autoFocus onClick={onStart}>
            Ear review
          </KeyButton>
          <KeyButton shortcut="x" onClick={onExit}>
            Exit
          </KeyButton>
        </div>
      </div>
    </div>
  )
}
