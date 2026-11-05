"use client"

import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react"
import { VoicePicker } from "@/components/voice-picker"
import {
  clearPassword,
  passwordHeaders,
  readPassword,
  subscribePassword,
  writePassword,
} from "@/lib/client-auth"
import { requestJson } from "@/lib/http"
import { DEFAULT_VOICE, RATES, type RateId } from "@/lib/speech"
import type { SettingsResponse } from "@/lib/types"

function emptyPassword() {
  return ""
}

export default function SettingsPage() {
  const storedPassword = useSyncExternalStore(subscribePassword, readPassword, emptyPassword)
  const [draft, setDraft] = useState<string | null>(null)
  const password = draft ?? storedPassword
  const [autoSpeak, setAutoSpeak] = useState(false)
  const [voice, setVoice] = useState(DEFAULT_VOICE)
  const [rate, setRate] = useState<RateId>("+0%")
  const [ready, setReady] = useState(false)
  const [pending, setPending] = useState(false)
  const [passwordPending, setPasswordPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    requestJson<SettingsResponse>("/api/settings")
      .then((data) => {
        if (cancelled) return
        setAutoSpeak(data.settings.autoSpeak)
        setVoice(data.settings.voice)
        setRate(data.settings.rate)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Couldn't load settings")
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function rememberPassword() {
    if (passwordPending) return
    if (!password) {
      setPasswordError("Enter a password")
      return
    }
    setPasswordPending(true)
    setPasswordError(null)
    try {
      await requestJson("/api/password", {
        method: "POST",
        headers: passwordHeaders(password),
      })
      writePassword(password)
      setDraft(null)
    } catch (caught) {
      setPasswordError(caught instanceof Error ? caught.message : "Wrong password")
    } finally {
      setPasswordPending(false)
    }
  }

  function forgetPassword() {
    clearPassword()
    setDraft(null)
    setPasswordError(null)
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setSaved(false)
    setError(null)
    try {
      const data = await requestJson<SettingsResponse>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ autoSpeak, voice, rate }),
      })
      setAutoSpeak(data.settings.autoSpeak)
      setVoice(data.settings.voice)
      setRate(data.settings.rate)
      setSaved(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save")
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-5 py-8">
      <div>
        <p className="font-mono text-[11px] tracking-[0.2em] text-muted uppercase">Settings</p>
        <h1 className="mt-2 text-4xl tracking-tight">Speech and password</h1>
      </div>

      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-2">
          <span className="text-sm text-ink">Password</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            spellCheck={false}
            value={password}
            onChange={(event) => setDraft(event.target.value)}
            className="h-10 rounded-md border border-line bg-panel px-3 text-sm text-ink"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void rememberPassword()}
            disabled={passwordPending}
            className="inline-flex h-10 items-center justify-center border border-lime bg-lime px-4 text-sm font-medium text-lime-ink disabled:opacity-40"
          >
            {passwordPending ? "Checking" : "Save password"}
          </button>
          <button
            type="button"
            onClick={forgetPassword}
            className="inline-flex h-10 items-center justify-center border border-line bg-panel px-4 text-sm text-ink"
          >
            Clear
          </button>
          {passwordError ? (
            <p role="alert" className="text-sm text-hot">
              {passwordError}
            </p>
          ) : null}
        </div>
      </div>

      <form onSubmit={(event) => void save(event)} className="flex flex-col gap-6">
        <fieldset className="flex flex-col gap-4 border border-line bg-panel px-5 py-5" disabled={!ready || pending}>
          <legend className="px-1 text-sm text-ink">Speech</legend>
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm text-ink">Speak automatically</span>
            <input
              type="checkbox"
              checked={autoSpeak}
              onChange={(event) => {
                setAutoSpeak(event.target.checked)
                setSaved(false)
              }}
              className="size-4 accent-lime"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-ink">Rate</span>
            <select
              value={rate}
              onChange={(event) => {
                setRate(event.target.value as RateId)
                setSaved(false)
              }}
              className="h-10 rounded-md border border-line bg-bg px-3 text-sm text-ink"
            >
              {RATES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label} · {item.id}
                </option>
              ))}
            </select>
          </label>
          {ready ? (
            <VoicePicker
              value={voice}
              disabled={pending}
              onChange={(next) => {
                setVoice(next)
                setSaved(false)
              }}
            />
          ) : (
            <p className="text-sm text-muted">Loading voices…</p>
          )}
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={!ready || pending}
            className="inline-flex h-10 items-center justify-center border border-lime bg-lime px-4 text-sm font-medium text-lime-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "Saving" : "Save"}
          </button>
          {saved ? (
            <p role="status" className="text-sm text-good">
              Saved
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-hot">
              {error}
            </p>
          ) : null}
        </div>
      </form>
    </main>
  )
}
