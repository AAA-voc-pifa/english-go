"use client"

import { useState, useSyncExternalStore, type FormEvent } from "react"
import { AppHeader } from "@/components/app-header"
import { passwordHeaders, readPassword, subscribePassword, writePassword } from "@/lib/client-auth"
import { requestJson } from "@/lib/http"

function unknownPassword(): string | null {
  return null
}

export function PasswordGate({ children }: { children: React.ReactNode }) {
  const stored = useSyncExternalStore(subscribePassword, readPassword, unknownPassword)
  return (
    <>
      {stored ? <AppHeader /> : null}
      {children}
      {stored ? null : <PasswordCover mode={stored === null ? "loading" : "prompt"} />}
    </>
  )
}

function PasswordPrompt() {
  const [password, setPassword] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    if (!password) {
      setError("Enter a password")
      return
    }
    setPending(true)
    setError(null)
    try {
      await requestJson("/api/password", {
        method: "POST",
        headers: passwordHeaders(password),
      })
      writePassword(password)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Wrong password")
    } finally {
      setPending(false)
    }
  }

  return (
    <div
      data-password-lock=""
      className="fixed inset-0 z-40 flex items-center justify-center bg-bg px-5"
    >
      <form onSubmit={(event) => void submit(event)} className="flex w-full max-w-md flex-col gap-4">
        <p className="font-mono text-[11px] tracking-[0.2em] text-muted uppercase">English Go</p>
        <h1 className="text-4xl tracking-tight">Password</h1>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          spellCheck={false}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="h-10 rounded-md border border-line bg-panel px-3 text-sm text-ink"
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-10 items-center justify-center border border-lime bg-lime px-4 text-sm font-medium text-lime-ink disabled:opacity-40"
          >
            {pending ? "Checking" : "Enter"}
          </button>
          {error ? (
            <p role="alert" className="text-sm text-hot">
              {error}
            </p>
          ) : null}
        </div>
      </form>
    </div>
  )
}

function PasswordCover({ mode }: { mode: "loading" | "prompt" }) {
  if (mode === "loading") {
    return (
      <div data-password-lock="" className="fixed inset-0 z-40 flex items-center bg-bg px-5">
        <p role="status" className="text-muted">
          Loading…
        </p>
      </div>
    )
  }
  return <PasswordPrompt />
}
