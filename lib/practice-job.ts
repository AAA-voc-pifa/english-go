"use client"

import { requestJson } from "@/lib/http"
import type { DeckResponse, OpenPracticeResponse } from "@/lib/types"

type PracticeJob =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "ready"; id: string }
  | { status: "error"; message: string }

const idle: PracticeJob = { status: "idle" }
let job: PracticeJob = idle
let openId: string | null = null
const listeners = new Set<() => void>()
const openListeners = new Set<() => void>()
let openRefresh: Promise<void> | null = null

function emit() {
  for (const listener of listeners) listener()
}

function emitOpen() {
  for (const listener of openListeners) listener()
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

export function subscribeOpenPractice(listener: () => void) {
  openListeners.add(listener)
  return () => {
    openListeners.delete(listener)
  }
}

export function readOpenPracticeId() {
  return openId
}

export function refreshOpenPractice() {
  openRefresh ??= requestJson<OpenPracticeResponse>("/api/practices?open=1")
    .then((data) => {
      if (openId === data.openId) return
      openId = data.openId
      emitOpen()
    })
    .catch(() => {
      // Keep the last known open id; the next refresh can recover.
    })
    .finally(() => {
      openRefresh = null
    })
  return openRefresh
}

export function startPractice() {
  if (job.status === "pending" || job.status === "ready") return
  job = { status: "pending" }
  emit()
  void requestJson<DeckResponse>("/api/practices", { method: "POST" })
    .then((data) => {
      job = { status: "ready", id: data.deck.id }
      openId = data.deck.id
      emit()
      emitOpen()
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
  void refreshOpenPractice()
}
