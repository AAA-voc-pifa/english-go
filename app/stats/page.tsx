"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { KeyButton } from "@/components/key-button"
import { requestJson } from "@/lib/http"
import type { StatsResponse, StatsSnapshot } from "@/lib/types"

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[11px] tracking-[0.16em] text-muted uppercase">{label}</p>
      <p className="mt-2 font-serif text-3xl tracking-tight tabular-nums lg:text-4xl">{value}</p>
      {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
    </div>
  )
}

function ScoreSpread({
  title,
  lowest,
  highest,
  buckets,
}: {
  title: string
  lowest: number
  highest: number
  buckets: Array<{ label: string; count: number }>
}) {
  const bars = buckets.filter((bucket) => bucket.count > 0)
  const peak = Math.max(...bars.map((bucket) => bucket.count), 1)

  const width = 480
  const height = 220
  const padTop = 22
  const padBottom = 32
  const padX = 4
  const chartBottom = height - padBottom
  const chartHeight = chartBottom - padTop
  const slot = bars.length === 0 ? 0 : (width - padX * 2) / bars.length
  const barWidth = Math.min(slot * 0.52, 36)

  return (
    <section className="min-w-0">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="min-w-0 font-mono text-[11px] tracking-[0.2em] text-muted uppercase">{title}</h2>
        <p className="shrink-0 font-mono text-[11px] text-muted tabular-nums">
          {lowest} – {highest}
        </p>
      </div>

      {bars.length === 0 ? (
        <p className="mt-8 text-sm text-muted">Nothing scored yet.</p>
      ) : (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="mt-5 block w-full"
          role="img"
          aria-label={`${title}: ${bars.map((bucket) => `${bucket.label} ${bucket.count}`).join(", ")}`}
        >
          <line x1={0} y1={chartBottom} x2={width} y2={chartBottom} stroke="var(--line)" strokeWidth={1} />
          {bars.map((bucket, index) => {
            const barHeight = Math.max((bucket.count / peak) * chartHeight, 2)
            const x = padX + index * slot + (slot - barWidth) / 2
            const y = chartBottom - barHeight
            const cx = x + barWidth / 2
            return (
              <g key={bucket.label}>
                <rect x={x} y={y} width={barWidth} height={barHeight} fill="var(--lime)" />
                <text
                  x={cx}
                  y={y - 8}
                  textAnchor="middle"
                  fill="var(--ink)"
                  fontSize={12}
                  fontFamily="var(--font-mono), ui-monospace, monospace"
                >
                  {bucket.count}
                </text>
                <text
                  x={cx}
                  y={height - 10}
                  textAnchor="middle"
                  fill="var(--muted)"
                  fontSize={11}
                  fontFamily="var(--font-mono), ui-monospace, monospace"
                >
                  {bucket.label}
                </text>
              </g>
            )
          })}
        </svg>
      )}
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

          <section className="grid gap-12 lg:grid-cols-2 lg:items-start">
            <ScoreSpread
              title="Word score spread"
              lowest={stats.words.lowest}
              highest={stats.words.highest}
              buckets={stats.words.buckets}
            />
            <ScoreSpread
              title="Sentence score spread"
              lowest={stats.favourites.lowest}
              highest={stats.favourites.highest}
              buckets={stats.favourites.buckets}
            />
          </section>
        </>
      ) : null}
    </main>
  )
}
