"use client"

import { requestJson } from "@/lib/http"
import type { DeckResponse } from "@/lib/types"

type PracticeJob =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "ready"; id: string }
  | { status: "error"; message: string }

const idle: PracticeJob = { status: "idle" }
let job: PracticeJob = idle
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function subscribePracticeJob(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function readPracticeJob() {
  return job
}

export function idlePracticeJob() {
  return idle
}

export function startPractice() {
  if (job.status === "pending" || job.status === "ready") return
  job = { status: "pending" }
  emit()
  void requestJson<DeckResponse>("/api/practices", { method: "POST" })
    .then((data) => {
      job = { status: "ready", id: data.deck.id }
      emit()
    })
    .catch((caught: unknown) => {
      job = {
        status: "error",
        message: caught instanceof Error ? caught.message : "Couldn't write the sentences",
      }
      emit()
    })
}

export function dismissPracticeJob() {
  if (job.status === "pending") return
  job = idle
  emit()
}
