"use client"

import { useEffect, useMemo, useState } from "react"
import { requestJson } from "@/lib/http"
import type { TtsVoice } from "@/lib/speech"
import type { VoicesResponse } from "@/lib/types"

export function VoicePicker({
  value,
  disabled = false,
  onChange,
}: {
  value: string
  disabled?: boolean
  onChange: (voice: string) => void
}) {
  const [voices, setVoices] = useState<TtsVoice[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [language, setLanguage] = useState(() => value.split("-")[0] || "en")
  const [locale, setLocale] = useState(() => {
    const parts = value.split("-")
    return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : "all"
  })
  const [gender, setGender] = useState("all")
  const [query, setQuery] = useState("")

  useEffect(() => {
    let cancelled = false
    requestJson<VoicesResponse>("/api/voices")
      .then((data) => {
        if (!cancelled) setVoices(data.voices)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "读不到音色")
      })
    return () => {
      cancelled = true
    }
  }, [])

  const languages = useMemo(() => {
    if (!voices) return []
    return [...new Set(voices.map((item) => item.language).filter(Boolean))].sort()
  }, [voices])

  const locales = useMemo(() => {
    if (!voices) return []
    return [
      ...new Set(
        voices
          .filter((item) => !language || item.language === language)
          .map((item) => item.locale)
          .filter(Boolean),
      ),
    ].sort()
  }, [language, voices])

  const effectiveLocale =
    locale === "all" || locales.length === 0 || locales.includes(locale)
      ? locale
      : locales.includes("en-US")
        ? "en-US"
        : locales[0]

  const filtered = useMemo(() => {
    if (!voices) return []
    const needle = query.trim().toLowerCase()
    return voices
      .filter((item) => !language || item.language === language)
      .filter((item) => effectiveLocale === "all" || item.locale === effectiveLocale)
      .filter((item) => gender === "all" || item.gender === gender)
      .filter((item) => {
        if (!needle) return true
        return (
          item.id.toLowerCase().includes(needle) ||
          item.name.toLowerCase().includes(needle) ||
          item.locale.toLowerCase().includes(needle)
        )
      })
      .sort((left, right) => left.id.localeCompare(right.id))
  }, [effectiveLocale, gender, language, query, voices])

  const selected = voices?.find((item) => item.id === value) ?? null

  function choose(item: TtsVoice) {
    setLanguage(item.language || "en")
    setLocale(item.locale || "all")
    onChange(item.id)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm text-ink">阅读音色</span>
        {selected ? (
          <span className="text-xs text-muted">
            {selected.id} · {selected.gender}
          </span>
        ) : value ? (
          <span className="text-xs text-muted">{value}</span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">语言</span>
          <select
            value={languages.includes(language) ? language : languages[0] || language}
            disabled={disabled || !voices}
            onChange={(event) => {
              setLanguage(event.target.value)
              setLocale("all")
            }}
            className="h-11 rounded-full border border-line bg-paper px-4 text-sm text-ink"
          >
            {languages.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">地区</span>
          <select
            value={effectiveLocale}
            disabled={disabled || !voices}
            onChange={(event) => setLocale(event.target.value)}
            className="h-11 rounded-full border border-line bg-paper px-4 text-sm text-ink"
          >
            <option value="all">全部</option>
            {locales.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">性别</span>
          <select
            value={gender}
            disabled={disabled || !voices}
            onChange={(event) => setGender(event.target.value)}
            className="h-11 rounded-full border border-line bg-paper px-4 text-sm text-ink"
          >
            <option value="all">全部</option>
            <option value="Female">女</option>
            <option value="Male">男</option>
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">搜索</span>
        <input
          type="search"
          value={query}
          disabled={disabled || !voices}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Aria / en-GB / Natasha"
          className="h-11 rounded-full border border-line bg-paper px-4 text-sm text-ink"
        />
      </label>

      {!voices && !error ? <p className="text-sm text-muted">正在读取音色…</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-accent">
          {error}
        </p>
      ) : null}

      {voices ? (
        <div className="max-h-72 overflow-auto rounded-3xl border border-line bg-paper">
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">没有匹配的音色</p>
          ) : (
            <ul className="divide-y divide-line">
              {filtered.map((item) => {
                const active = item.id === value
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => choose(item)}
                      className={
                        active
                          ? "flex w-full flex-col items-start gap-0.5 bg-ink px-4 py-3 text-left text-paper"
                          : "flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left text-ink hover:bg-card"
                      }
                    >
                      <span className="text-sm font-medium">{item.id}</span>
                      <span className={active ? "text-xs text-paper/75" : "text-xs text-muted"}>
                        {item.locale} · {item.gender}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
