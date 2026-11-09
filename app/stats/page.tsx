"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { KeyButton } from "@/components/key-button"
import { requestJson } from "@/lib/http"
import type { StatsResponse, StatsSnapshot, WordStat } from "@/lib/types"

function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[11px] tracking-[0.16em] text-muted uppercase">{label}</p>
      <p className="mt-2 font-serif text-3xl tracking-tight tabular-nums lg:text-4xl">{value}</p>
      {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
    </div>
  )
}

function WordList({ title, items, stamp }: { title: string; items: WordStat[]; stamp?: boolean }) {
  return (
    <section className="min-w-0 flex flex-col gap-3">
      <h2 className="font-mono text-[11px] tracking-[0.2em] text-muted uppercase">{title}</h2>
      {items.length === 0 ? <p className="text-sm text-muted">Nothing here yet.</p> : null}
      <ul className="divide-y divide-line border-y border-line">
        {items.map((item) => (
          <li key={`${title}-${item.word}`} className="flex items-baseline justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-serif text-lg">{item.word}</p>
              {stamp && item.updatedAt ? (
                <time dateTime={item.updatedAt} className="font-mono text-[11px] text-muted">
                  {formatWhen(item.updatedAt)}
                </time>
              ) : null}
            </div>
            <span className="shrink-0 font-mono text-xs text-muted tabular-nums">{item.points} pts</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function StatsPage() {
  const router = useRouter()
  const [stats, setStats] = useState<StatsSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    requestJson<StatsResponse>("/api/stats")
      .then((data) => {
        if (!cancelled) setStats(data.stats)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Couldn't load stats")
      })
    return () => {
      cancelled = true
    }
  }, [])

  const maxBucket = Math.max(1, ...(stats?.words.buckets.map((bucket) => bucket.count) ?? [1]))

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-5 py-8 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] tracking-[0.2em] text-muted uppercase">Stats</p>
          <h1 className="mt-2 text-3xl tracking-tight sm:text-4xl">Progress</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Word scores come from my-voc. Favourite scores are sentence points from review.
          </p>
        </div>
        <KeyButton shortcut="b" onClick={() => router.push("/")}>
          Back
        </KeyButton>
      </div>

      {error ? (
        <p role="alert" className="text-hot">
          {error}
        </p>
      ) : null}
      {!stats && !error ? (
        <p role="status" className="text-muted">
          Loading…
        </p>
      ) : null}

      {stats ? (
        <>
          <section className="grid gap-8 border-y border-line py-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-10">
            <Stat
              label="Words"
              value={stats.words.total}
              hint={`avg ${stats.words.average} · median ${stats.words.median} word pts`}
            />
            <Stat
              label="Practices"
              value={stats.practices.total}
              hint={`${stats.practices.completed} finished · +${stats.practices.pointsEarned} word pts`}
            />
            <Stat
              label="Favourites"
              value={stats.favourites.total}
              hint={`avg ${stats.favourites.average} sentence pts · ${stats.favourites.unscored} still at 0`}
            />
            <Stat
              label="Reviews"
              value={stats.reviews.total}
              hint={`${stats.reviews.completed} finished · ${stats.reviews.sentencesScored} scored`}
            />
          </section>

          <section className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start">
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="font-mono text-[11px] tracking-[0.2em] text-muted uppercase">Score spread</h2>
                <p className="mt-2 text-sm text-muted">
                  Lowest {stats.words.lowest} · highest {stats.words.highest}
                </p>
              </div>
              <ul className="flex flex-col gap-3">
                {stats.words.buckets.map((bucket) => (
                  <li key={bucket.label} className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-3">
                    <span className="font-mono text-[11px] text-muted tabular-nums">{bucket.label}</span>
                    <div className="h-2 bg-line">
                      <div
                        className="h-full bg-lime"
                        style={{ width: `${(bucket.count / maxBucket) * 100}%` }}
                      />
                    </div>
                    <span className="text-right font-mono text-xs tabular-nums">{bucket.count}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-t border-line pt-6 text-sm leading-7 text-muted lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">
              <p className="font-mono text-[11px] tracking-[0.2em] uppercase">Activity</p>
              <p className="mt-3 text-ink">
                {stats.practices.sentencesScored} practice sentences scored
              </p>
              <p>{stats.reviews.sentencesScored} favourite sentences scored in review</p>
              <p className="mt-4">
                +{stats.practices.pointsEarned} word points from scored practice sentences
              </p>
              <p>{stats.practices.completed} of {stats.practices.total} practices finished</p>
            </div>
          </section>

          <div className="grid gap-10 md:grid-cols-2 xl:grid-cols-3">
            <WordList title="Needs work" items={stats.words.weakest} />
            {stats.words.strongest.length > 0 ? (
              <WordList title="Strongest" items={stats.words.strongest} />
            ) : null}
            <div className={stats.words.strongest.length > 0 ? "md:col-span-2 xl:col-span-1" : "md:col-span-1"}>
              <WordList title="Recently updated" items={stats.words.recent} stamp />
            </div>
          </div>

          <section className="flex flex-col gap-3">
            <h2 className="font-mono text-[11px] tracking-[0.2em] text-muted uppercase">Favourites to review</h2>
            {stats.favourites.weakest.length === 0 ? (
              <p className="text-sm text-muted">Star sentences during practice to track them here.</p>
            ) : (
              <ul className="grid border-t border-line md:grid-cols-2 md:gap-x-10">
                {stats.favourites.weakest.map((item) => (
                  <li key={item.id} className="flex flex-col gap-1 border-b border-line py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-serif text-lg">{item.word}</span>
                      <span className="font-mono text-xs text-muted tabular-nums">{item.points} pts</span>
                    </div>
                    <p lang="en" className="text-sm leading-6 text-muted">
                      {item.en}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </main>
  )
}
