"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import { KeyButton } from "@/components/key-button"
import { MnemonicView } from "@/components/mnemonic-view"
import { requestJson } from "@/lib/http"
import type { MnemonicData, MnemonicDetailResponse } from "@/lib/types"

type Draft = {
  etymologyComponents: string
  etymologyExplanation: string
  variant: string
  homophonicList: string
  homophonicBest: string
  abbreviation: string
  meme: string
  other: string
  allInOne: string
}

function emptyDraft(): Draft {
  return {
    etymologyComponents: "",
    etymologyExplanation: "",
    variant: "",
    homophonicList: "",
    homophonicBest: "0",
    abbreviation: "",
    meme: "",
    other: "",
    allInOne: "",
  }
}

function toDraft(data: MnemonicData): Draft {
  return {
    etymologyComponents: data.etymology?.components.join("\n") ?? "",
    etymologyExplanation: data.etymology?.explanation ?? "",
    variant: data.variant ?? "",
    homophonicList: data.homophonic?.list.join("\n") ?? "",
    homophonicBest: String(data.homophonic?.best ?? 0),
    abbreviation: data.abbreviation ?? "",
    meme: data.meme ?? "",
    other: data.other ?? "",
    allInOne: data.all_in_one ?? "",
  }
}

function fromDraft(draft: Draft): MnemonicData {
  const components = draft.etymologyComponents
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
  const explanation = draft.etymologyExplanation.trim()
  const list = draft.homophonicList
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .slice(0, 3)
  const best = Number(draft.homophonicBest)

  return {
    etymology: components.length > 0 || explanation ? { components, explanation } : null,
    variant: draft.variant.trim() || null,
    homophonic: list.length > 0 ? { list, best: Number.isFinite(best) ? best : 0 } : null,
    abbreviation: draft.abbreviation.trim() || null,
    meme: draft.meme.trim() || null,
    other: draft.other.trim() || null,
    all_in_one: draft.allInOne.trim() || null,
  }
}

function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="font-mono text-[11px] tracking-[0.16em] text-muted uppercase">{label}</span>
      {children}
    </label>
  )
}

const inputClass =
  "min-h-11 w-full border border-line bg-panel px-3 py-2 text-base text-ink sm:min-h-10 sm:text-sm"
const areaClass = `${inputClass} min-h-28 resize-y`

export default function MnemonicDetailPage() {
  const params = useParams<{ word: string }>()
  const router = useRouter()
  const word = decodeURIComponent(params.word ?? "")
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [preview, setPreview] = useState<MnemonicData | null>(null)
  const [ready, setReady] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!word) {
      setError("Mnemonic not found")
      setReady(true)
      return
    }
    requestJson<MnemonicDetailResponse>(`/api/mnemonics/${encodeURIComponent(word)}`)
      .then((data) => {
        if (cancelled) return
        setDraft(toDraft(data.mnemonic.data))
        setPreview(data.mnemonic.data)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Couldn't load mnemonic")
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [word])

  function patchDraft<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
    setSaved(false)
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || !word) return
    setPending(true)
    setError(null)
    setSaved(false)
    try {
      const data = fromDraft(draft)
      const response = await requestJson<MnemonicDetailResponse>(`/api/mnemonics/${encodeURIComponent(word)}`, {
        method: "PATCH",
        body: JSON.stringify({ data }),
      })
      setDraft(toDraft(response.mnemonic.data))
      setPreview(response.mnemonic.data)
      setSaved(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save mnemonic")
    } finally {
      setPending(false)
    }
  }

  async function remove() {
    if (pending || !word) return
    setPending(true)
    setError(null)
    try {
      await requestJson(`/api/mnemonics/${encodeURIComponent(word)}`, { method: "DELETE" })
      router.push("/mnemonics")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't delete mnemonic")
      setPending(false)
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] tracking-[0.2em] text-muted uppercase">Mnemonic</p>
          <h1 className="mt-2 font-serif text-3xl tracking-tight sm:text-4xl">{word || "…"}</h1>
        </div>
        <KeyButton shortcut="b" onClick={() => router.push("/mnemonics")}>
          Back
        </KeyButton>
      </div>

      {error ? (
        <p role="alert" className="text-hot">
          {error}
        </p>
      ) : null}
      {!ready ? (
        <p role="status" className="text-muted">
          Loading…
        </p>
      ) : null}

      {ready && preview ? (
        <>
          <div className="border border-line bg-panel px-4 py-4">
            <p className="font-mono text-[11px] tracking-[0.16em] text-muted uppercase">Preview</p>
            <MnemonicView data={preview} />
          </div>

          <form onSubmit={(event) => void save(event)} className="flex flex-col gap-5">
            <Field label="All in one">
              <textarea
                value={draft.allInOne}
                onChange={(event) => patchDraft("allInOne", event.target.value)}
                className={areaClass}
              />
            </Field>
            <Field label="Etymology components (one per line)">
              <textarea
                value={draft.etymologyComponents}
                onChange={(event) => patchDraft("etymologyComponents", event.target.value)}
                className={areaClass}
              />
            </Field>
            <Field label="Etymology explanation">
              <textarea
                value={draft.etymologyExplanation}
                onChange={(event) => patchDraft("etymologyExplanation", event.target.value)}
                className={areaClass}
              />
            </Field>
            <Field label="Variant">
              <textarea
                value={draft.variant}
                onChange={(event) => patchDraft("variant", event.target.value)}
                className={areaClass}
              />
            </Field>
            <Field label="Homophonic list (one per line, max 3)">
              <textarea
                value={draft.homophonicList}
                onChange={(event) => patchDraft("homophonicList", event.target.value)}
                className={areaClass}
              />
            </Field>
            <Field label="Homophonic best index">
              <input
                type="number"
                min={0}
                max={2}
                value={draft.homophonicBest}
                onChange={(event) => patchDraft("homophonicBest", event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Abbreviation">
              <textarea
                value={draft.abbreviation}
                onChange={(event) => patchDraft("abbreviation", event.target.value)}
                className={areaClass}
              />
            </Field>
            <Field label="Meme">
              <textarea
                value={draft.meme}
                onChange={(event) => patchDraft("meme", event.target.value)}
                className={areaClass}
              />
            </Field>
            <Field label="Other">
              <textarea
                value={draft.other}
                onChange={(event) => patchDraft("other", event.target.value)}
                className={areaClass}
              />
            </Field>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={pending}
                className="inline-flex h-10 items-center border border-lime bg-lime px-4 text-sm font-medium text-lime-ink disabled:opacity-40"
              >
                {pending ? "Saving" : "Save"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => void remove()}
                className="inline-flex h-10 items-center border border-line bg-panel px-4 text-sm text-hot disabled:opacity-40"
              >
                Delete
              </button>
              {saved ? <p className="text-sm text-good">Saved</p> : null}
            </div>
          </form>
        </>
      ) : null}

      {ready && !preview && !error ? (
        <p className="text-muted">
          Missing mnemonic.{" "}
          <Link href="/mnemonics" className="text-lime">
            Back to list
          </Link>
        </p>
      ) : null}
    </main>
  )
}
