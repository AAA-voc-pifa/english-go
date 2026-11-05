"use client"

import { useState, useSyncExternalStore, type FormEvent } from "react"
import { passwordHeaders, readPassword, subscribePassword, writePassword } from "@/lib/client-auth"
import { requestJson } from "@/lib/http"

function unknownPassword(): string | null {
  return null
}

export function PasswordGate({ children }: { children: React.ReactNode }) {
  const stored = useSyncExternalStore(subscribePassword, readPassword, unknownPassword)
  if (stored === null) {
    return (
      <p role="status" className="px-5 py-8 text-muted">
        正在读取…
      </p>
    )
  }
  if (!stored) return <PasswordPrompt />
  return children
}

function PasswordPrompt() {
  const [password, setPassword] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    if (!password) {
      setError("先填写口令")
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
      setError(caught instanceof Error ? caught.message : "口令不对")
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-16">
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <h1 className="font-serif text-4xl italic tracking-tight">口令</h1>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          spellCheck={false}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="h-11 rounded-full border border-line bg-card px-4 text-sm text-ink"
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-11 items-center justify-center rounded-full bg-ink px-4 text-sm font-medium text-paper disabled:opacity-50"
          >
            {pending ? "正在核对" : "进入"}
          </button>
          {error ? (
            <p role="alert" className="text-sm text-accent">
              {error}
            </p>
          ) : null}
        </div>
      </form>
    </main>
  )
}
