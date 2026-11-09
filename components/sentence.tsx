"use client"

import { Check, Copy } from "lucide-react"
import { useEffect, useRef, useState } from "react"

const WORD_PATTERN = /[.*+?^${}()|[\]\\]/g

function splitSentence(sentence: string, word: string): Array<{ text: string; hit: boolean }> {
  const needle = word.trim()
  if (!needle) return [{ text: sentence, hit: false }]
  const escaped = needle.replace(WORD_PATTERN, "\\$&")
  const pattern = new RegExp(`[A-Za-z]*${escaped}[A-Za-z]*`, "gi")
  const parts: Array<{ text: string; hit: boolean }> = []
  let last = 0
  for (const match of sentence.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > last) parts.push({ text: sentence.slice(last, index), hit: false })
    parts.push({ text: match[0], hit: true })
    last = index + match[0].length
  }
  if (last < sentence.length) parts.push({ text: sentence.slice(last), hit: false })
  if (parts.length === 0) parts.push({ text: sentence, hit: false })
  return parts
}

export function Sentence({
  en,
  word,
  size = "practice",
}: {
  en: string
  word: string
  size?: "practice" | "review"
}) {
  const parts = splitSentence(en, word)
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
  }, [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(en)
      setCopied(true)
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="flex items-start gap-2">
      <p
        lang="en"
        className={
          size === "review"
            ? "min-w-0 flex-1 font-serif text-lg leading-snug wrap-break-word text-ink"
            : "min-w-0 flex-1 font-serif text-[1.85rem] leading-[1.25] tracking-tight wrap-break-word text-ink sm:text-5xl sm:leading-[1.15]"
        }
      >
        {parts.map((part, index) =>
          part.hit ? (
            <mark key={index} className="bg-transparent text-lime underline decoration-2 underline-offset-[5px]">
              {part.text}
            </mark>
          ) : (
            <span key={index}>{part.text}</span>
          ),
        )}
      </p>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={copied ? "Copied" : "Copy sentence"}
        title={copied ? "Copied" : "Copy"}
        className={
          size === "review"
            ? "inline-flex size-8 shrink-0 items-center justify-center border border-line bg-panel text-muted hover:text-ink"
            : "mt-1 inline-flex size-9 shrink-0 items-center justify-center border border-line bg-panel text-muted hover:text-ink sm:mt-2"
        }
      >
        {copied ? <Check aria-hidden="true" className="size-3.5 text-good" /> : <Copy aria-hidden="true" className="size-3.5" />}
      </button>
    </div>
  )
}
