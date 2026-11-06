"use client"

import { useEffect, useSyncExternalStore } from "react"
import { useRouter } from "next/navigation"
import {
  dismissPracticeJob,
  idlePracticeJob,
  readPracticeJob,
  subscribePracticeJob,
} from "@/lib/practice-job"

export function PracticeReadyDialog() {
  const job = useSyncExternalStore(subscribePracticeJob, readPracticeJob, idlePracticeJob)
  const router = useRouter()
  const open = job.status === "ready" || job.status === "error"

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      event.preventDefault()
      dismissPracticeJob()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  if (job.status === "ready") {
    const id = job.id
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center bg-bg/80 px-5">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="practice-ready-title"
          className="flex w-full max-w-md flex-col gap-4 border border-line bg-panel p-6"
        >
          <h2 id="practice-ready-title" className="text-3xl tracking-tight">
            New quiz is ready
          </h2>
          <p className="text-muted">Start it now?</p>
          <div className="flex gap-2">
            <button
              type="button"
              autoFocus
              onClick={() => {
                dismissPracticeJob()
                router.push(`/practice/${id}`)
              }}
              className="inline-flex h-10 items-center justify-center border border-lime bg-lime px-4 text-sm font-medium text-lime-ink"
            >
              Start
            </button>
            <button
              type="button"
              onClick={dismissPracticeJob}
              className="inline-flex h-10 items-center justify-center border border-line bg-panel px-4 text-sm"
            >
              Later
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (job.status === "error") {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center bg-bg/80 px-5">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="practice-ready-title"
          className="flex w-full max-w-md flex-col gap-4 border border-line bg-panel p-6"
        >
          <h2 id="practice-ready-title" className="text-3xl tracking-tight">
            Couldn&apos;t write the sentences
          </h2>
          <p role="alert" className="text-sm leading-6 text-hot">
            {job.message}
          </p>
          <button
            type="button"
            autoFocus
            onClick={dismissPracticeJob}
            className="inline-flex h-10 w-fit items-center justify-center border border-line bg-panel px-4 text-sm"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  return null
}
