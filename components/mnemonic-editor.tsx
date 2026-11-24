"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react"
import { Plus, Trash2, X } from "lucide-react"
import { KeyButton } from "@/components/key-button"
import { MnemonicView } from "@/components/mnemonic-view"
import { requestJson } from "@/lib/http"
import type { MnemonicData, MnemonicDetailResponse } from "@/lib/types"

type Draft = {
  allInOne: string
  etymologyOn: boolean
  components: string[]
  explanation: string
  variantOn: boolean
  variant: string
  homophonicOn: boolean
  homophonic: string[]
  best: number
  abbreviationOn: boolean
  abbreviation: string
  memeOn: boolean
  meme: string
  otherOn: boolean
  other: string
}

function emptyDraft(): Draft {
  return {
    allInOne: "",
    etymologyOn: false,
    components: [""],
    explanation: "",
    variantOn: false,
    variant: "",
    homophonicOn: false,
    homophonic: [""],
    best: 0,
    abbreviationOn: false,
    abbreviation: "",
    memeOn: false,
    meme: "",
    otherOn: false,
    other: "",
  }
}

function toDraft(data: MnemonicData): Draft {
  return {
    allInOne: data.all_in_one ?? "",
    etymologyOn: data.etymology !== null,
    components: data.etymology?.components.length ? [...data.etymology.components] : [""],
    explanation: data.etymology?.explanation ?? "",
    variantOn: data.variant !== null,
    variant: data.variant ?? "",
    homophonicOn: data.homophonic !== null,
    homophonic: data.homophonic?.list.length ? [...data.homophonic.list] : [""],
    best: data.homophonic?.best ?? 0,
    abbreviationOn: data.abbreviation !== null,
    abbreviation: data.abbreviation ?? "",
    memeOn: data.meme !== null,
    meme: data.meme ?? "",
    otherOn: data.other !== null,
    other: data.other ?? "",
  }
}

function fromDraft(draft: Draft): MnemonicData {
  const components = draft.components.map((item) => item.trim()).filter((item) => item !== "")
  const explanation = draft.explanation.trim()
  const list = draft.homophonic.map((item) => item.trim()).filter((item) => item !== "").slice(0, 3)

  return {
    all_in_one: draft.allInOne.trim() || null,
    etymology:
      draft.etymologyOn && components.length > 0 && explanation
        ? { components, explanation }
        : null,
    variant: draft.variantOn ? draft.variant.trim() || null : null,
    homophonic:
      draft.homophonicOn && list.length > 0
        ? { list, best: Math.min(Math.max(draft.best, 0), list.length - 1) }
        : null,
    abbreviation: draft.abbreviationOn ? draft.abbreviation.trim() || null : null,
    meme: draft.memeOn ? draft.meme.trim() || null : null,
    other: draft.otherOn ? draft.other.trim() || null : null,
  }
}

function draftErrors(draft: Draft): string | null {
  if (draft.etymologyOn) {
    const components = draft.components.map((item) => item.trim()).filter((item) => item !== "")
    const explanation = draft.explanation.trim()
    if (components.length === 0 && !explanation) return "Etymology is on but empty — add parts or turn it off"
    if (components.length === 0) return "Etymology needs at least one component"
    if (!explanation) return "Etymology needs an explanation"
  }
  if (draft.homophonicOn) {
    const list = draft.homophonic.map((item) => item.trim()).filter((item) => item !== "")
    if (list.length === 0) return "Homophonic is on but empty — add an entry or turn it off"
  }
  return null
}

const inputClass =
  "min-h-11 w-full border border-line bg-bg px-3 py-2 text-base text-ink sm:min-h-10 sm:text-sm"
const areaClass = `${inputClass} min-h-24 resize-y`

function Section({
  title,
  hint,
  on,
  onToggle,
  children,
}: {
  title: string
  hint?: string
  on: boolean
  onToggle: (next: boolean) => void
  children: ReactNode
}) {
  return (
    <section className="border border-line">
      <div className="flex items-start justify-between gap-3 bg-panel px-4 py-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] tracking-[0.16em] text-muted uppercase">{title}</p>
          {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
        </div>
        <label className="inline-flex shrink-0 items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={on}
            onChange={(event) => onToggle(event.target.checked)}
            className="size-4 accent-lime"
          />
          <span>{on ? "On" : "Off"}</span>
        </label>
      </div>
      {on ? <div className="flex flex-col gap-3 border-t border-line px-4 py-4">{children}</div> : null}
    </section>
  )
}

function ListEditor({
  values,
  max,
  onChange,
  placeholder,
}: {
  values: string[]
  max?: number
  onChange: (next: string[]) => void
  placeholder?: string
}) {
  const canAdd = max === undefined || values.length < max

  return (
    <ul className="flex flex-col gap-2">
      {values.map((value, index) => (
        <li key={index} className="flex gap-2">
          <textarea
            value={value}
            rows={2}
            placeholder={placeholder}
            onChange={(event) => {
              const next = [...values]
              next[index] = event.target.value
              onChange(next)
            }}
            className={`${areaClass} min-h-[4.5rem]`}
          />
          <button
            type="button"
            aria-label={`Remove item ${index + 1}`}
            disabled={values.length <= 1}
            onClick={() => onChange(values.filter((_, i) => i !== index))}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center border border-line bg-panel text-muted hover:text-hot disabled:opacity-30"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </li>
      ))}
      {canAdd ? (
        <li>
          <button
            type="button"
            onClick={() => onChange([...values, ""])}
            className="inline-flex h-10 items-center gap-2 border border-dashed border-line px-3 text-sm text-muted hover:border-ink/40 hover:text-ink"
          >
            <Plus aria-hidden="true" className="size-4" />
            Add
          </button>
        </li>
      ) : null}
    </ul>
  )
}

export function MnemonicEditor({ word }: { word: string }) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [baseline, setBaseline] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [pending, setPending] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const preview = useMemo(() => fromDraft(draft), [draft])
  const dirty = baseline !== null && JSON.stringify(fromDraft(draft)) !== baseline
  const validation = draftErrors(draft)

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
        const next = toDraft(data.mnemonic.data)
        setDraft(next)
        setBaseline(JSON.stringify(fromDraft(next)))
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

  function patch(update: Partial<Draft> | ((current: Draft) => Draft)) {
    setDraft((current) => (typeof update === "function" ? update(current) : { ...current, ...update }))
    setSaved(false)
    setConfirmDelete(false)
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || !word || validation) return
    setPending(true)
    setError(null)
    setSaved(false)
    try {
      const data = fromDraft(draft)
      const response = await requestJson<MnemonicDetailResponse>(`/api/mnemonics/${encodeURIComponent(word)}`, {
        method: "PATCH",
        body: JSON.stringify({ data }),
      })
      const next = toDraft(response.mnemonic.data)
      setDraft(next)
      setBaseline(JSON.stringify(fromDraft(next)))
      setSaved(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save mnemonic")
    } finally {
      setPending(false)
    }
  }

  async function remove() {
    if (pending || !word) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setPending(true)
    setError(null)
    try {
      await requestJson(`/api/mnemonics/${encodeURIComponent(word)}`, { method: "DELETE" })
      router.push("/mnemonics")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't delete mnemonic")
      setPending(false)
      setConfirmDelete(false)
    }
  }

  if (!ready) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 py-8">
        <p role="status" className="text-muted">
          Loading…
        </p>
      </main>
    )
  }

  if (baseline === null) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-5 py-8">
        <p role="alert" className="text-hot">
          {error ?? "Mnemonic not found"}
        </p>
        <Link href="/mnemonics" className="text-lime">
          Back to list
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 py-8 pb-28">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">{word}</h1>
        <KeyButton shortcut="b" onClick={() => router.push("/mnemonics")}>
          Back
        </KeyButton>
      </div>

      {error ? (
        <p role="alert" className="text-hot">
          {error}
        </p>
      ) : null}

      <div className="border-l-2 border-lime/50 pl-4">
        <p className="font-mono text-[11px] tracking-[0.16em] text-lime uppercase">Live preview</p>
        <div className="mt-2">
          <MnemonicView data={preview} />
        </div>
      </div>

      <form onSubmit={(event) => void save(event)} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 border border-line px-4 py-4">
          <span className="font-mono text-[11px] tracking-[0.16em] text-muted uppercase">All in one</span>
          <span className="text-xs text-muted">Short line shown first on practice cards.</span>
          <textarea
            value={draft.allInOne}
            onChange={(event) => patch({ allInOne: event.target.value })}
            className={areaClass}
          />
        </label>

        <Section
          title="Etymology"
          hint="Word parts + how they combine."
          on={draft.etymologyOn}
          onToggle={(etymologyOn) => patch({ etymologyOn })}
        >
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted">Components</p>
            <ListEditor
              values={draft.components}
              onChange={(components) => patch({ components })}
              placeholder="`un-` from Latin unus…"
            />
          </div>
          <label className="flex flex-col gap-2">
            <span className="text-xs text-muted">Explanation</span>
            <textarea
              value={draft.explanation}
              onChange={(event) => patch({ explanation: event.target.value })}
              className={areaClass}
              placeholder="`un-` + `anim-` + `-ous` → …"
            />
          </label>
        </Section>

        <Section
          title="Variant"
          hint="More common spelling or form."
          on={draft.variantOn}
          onToggle={(variantOn) => patch({ variantOn })}
        >
          <textarea
            value={draft.variant}
            onChange={(event) => patch({ variant: event.target.value })}
            className={areaClass}
          />
        </Section>

        <Section
          title="Homophonic"
          hint="Up to 3 sound-alike cues. Mark the best."
          on={draft.homophonicOn}
          onToggle={(homophonicOn) => patch({ homophonicOn })}
        >
          <ul className="flex flex-col gap-2">
            {draft.homophonic.map((value, index) => (
              <li key={index} className="flex gap-2">
                <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center border border-line bg-panel">
                  <input
                    type="radio"
                    name="homophonic-best"
                    checked={draft.best === index}
                    onChange={() => patch({ best: index })}
                    className="size-4 accent-lime"
                    aria-label={`Mark item ${index + 1} as best`}
                  />
                </label>
                <textarea
                  value={value}
                  rows={2}
                  onChange={(event) => {
                    const homophonic = [...draft.homophonic]
                    homophonic[index] = event.target.value
                    patch({ homophonic })
                  }}
                  className={`${areaClass} min-h-[4.5rem]`}
                />
                <button
                  type="button"
                  aria-label={`Remove homophonic ${index + 1}`}
                  disabled={draft.homophonic.length <= 1}
                  onClick={() => {
                    const homophonic = draft.homophonic.filter((_, i) => i !== index)
                    const best =
                      draft.best === index
                        ? 0
                        : draft.best > index
                          ? draft.best - 1
                          : draft.best
                    patch({ homophonic: homophonic.length ? homophonic : [""], best })
                  }}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center border border-line bg-panel text-muted hover:text-hot disabled:opacity-30"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          {draft.homophonic.length < 3 ? (
            <button
              type="button"
              onClick={() => patch({ homophonic: [...draft.homophonic, ""] })}
              className="inline-flex h-10 items-center gap-2 self-start border border-dashed border-line px-3 text-sm text-muted hover:border-ink/40 hover:text-ink"
            >
              <Plus aria-hidden="true" className="size-4" />
              Add cue
            </button>
          ) : null}
        </Section>

        <Section title="Abbreviation" on={draft.abbreviationOn} onToggle={(abbreviationOn) => patch({ abbreviationOn })}>
          <textarea
            value={draft.abbreviation}
            onChange={(event) => patch({ abbreviation: event.target.value })}
            className={areaClass}
          />
        </Section>

        <Section title="Meme" hint="Quote, lyric, catchphrase." on={draft.memeOn} onToggle={(memeOn) => patch({ memeOn })}>
          <textarea
            value={draft.meme}
            onChange={(event) => patch({ meme: event.target.value })}
            className={areaClass}
          />
        </Section>

        <Section title="Other" on={draft.otherOn} onToggle={(otherOn) => patch({ otherOn })}>
          <textarea
            value={draft.other}
            onChange={(event) => patch({ other: event.target.value })}
            className={areaClass}
          />
        </Section>

        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-bg/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-3 px-5 py-3">
            <button
              type="submit"
              disabled={pending || Boolean(validation) || !dirty}
              className="inline-flex h-10 items-center border border-lime bg-lime px-4 text-sm font-medium text-lime-ink disabled:opacity-40"
            >
              {pending ? "Saving" : "Save"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => void remove()}
              className="inline-flex h-10 items-center gap-2 border border-line bg-panel px-4 text-sm text-hot disabled:opacity-40"
            >
              <Trash2 aria-hidden="true" className="size-4" />
              {confirmDelete ? "Confirm delete" : "Delete"}
            </button>
            {validation ? (
              <p role="status" className="text-sm text-hot">
                {validation}
              </p>
            ) : saved ? (
              <p role="status" className="text-sm text-good">
                Saved
              </p>
            ) : dirty ? (
              <p role="status" className="text-sm text-muted">
                Unsaved changes
              </p>
            ) : null}
          </div>
        </div>
      </form>
    </main>
  )
}
