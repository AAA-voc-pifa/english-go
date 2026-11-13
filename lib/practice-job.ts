"use client"

import { httpStatus, requestJson } from "@/lib/http"
import type { DeckResponse, OpenPracticeResponse } from "@/lib/types"

type PracticeJob =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "ready"; id: string }
  | { status: "error"; message: string; code: number }

const idle: PracticeJob = { status: "idle" }
let job: PracticeJob = idle
let openIds: string[] = []
/** Hide the global "ready" dialog while the post-practice next-step prompt is up. */
let suppressReadyDialog = false
const listeners = new Set<() => void>()
const openListeners = new Set<() => void>()
let openRefresh: Promise<void> | null = null

function sameIds(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  return left.every((id, index) => id === right[index])
}

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

export function readOpenPracticeIds() {
  return openIds
}

/** Oldest unfinished practice, if any. */
export function readOpenPracticeId() {
  return openIds[0] ?? null
}

/**
 * Refresh open practice ids from the server.
 * Calls are serialized so a later refresh is not collapsed into an in-flight
 * one that may have started before the last award was saved.
 */
export function refreshOpenPractice() {
  const prior = openRefresh
  const mine = (prior ?? Promise.resolve())
    .catch(() => undefined)
    .then(() =>
      requestJson<OpenPracticeResponse>("/api/practices?open=1").then((data) => {
        if (sameIds(openIds, data.openIds)) return
        openIds = data.openIds
        emitOpen()
      }),
    )
    .catch(() => {
      // Keep the last known open ids; the next refresh can recover.
    })
    .finally(() => {
      if (openRefresh === mine) openRefresh = null
    })
  openRefresh = mine
  return mine
}

/** Drop an id locally (e.g. just finished) so header New is not blocked on a stale list. */
export function removeOpenPracticeId(id: string) {
  if (!openIds.includes(id)) return
  openIds = openIds.filter((entry) => entry !== id)
  emitOpen()
}

export function startPractice() {
  if (job.status === "pending" || job.status === "ready") return
  job = { status: "pending" }
  emit()
  void requestJson<DeckResponse>("/api/practices", { method: "POST" })
    .then((data) => {
      job = { status: "ready", id: data.deck.id }
      if (!openIds.includes(data.deck.id)) {
        openIds = [...openIds, data.deck.id]
        emitOpen()
      }
      emit()
      void refreshOpenPractice()
    })
    .catch((caught: unknown) => {
      job = {
        status: "error",
        message: caught instanceof Error ? caught.message : "Couldn't write the sentences",
        code: httpStatus(caught),
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

export function setSuppressReadyDialog(next: boolean) {
  if (suppressReadyDialog === next) return
  suppressReadyDialog = next
  emit()
}

export function readSuppressReadyDialog() {
  return suppressReadyDialog
}
