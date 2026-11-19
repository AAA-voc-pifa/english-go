"use client"

import { useId, useState } from "react"
import type { ActivityDay } from "@/lib/types"

function heatFill(count: number, max: number): string {
  if (count <= 0 || max <= 0) return "var(--panel)"
  const t = count / max
  return `color-mix(in oklab, var(--lime) ${Math.round(t * 100)}%, var(--panel))`
}

function monthShort(date: string): string {
  const month = Number(date.slice(5, 7))
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1] ?? ""
}

function weeksFrom(days: ActivityDay[]): ActivityDay[][] {
  const weeks: ActivityDay[][] = []
  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7))
  }
  return weeks
}

type Tip = { date: string; count: number; left: number; top: number }

export function ActivityHeatmap({ days, total }: { days: ActivityDay[]; total: number }) {
  const weeks = weeksFrom(days)
  const maxCount = days.reduce((max, day) => Math.max(max, day.count), 0)
  const tipId = useId()
  const [tip, setTip] = useState<Tip | null>(null)

  const cell = 11
  const gap = 3
  const labelW = 28
  const monthH = 18
  const width = labelW + weeks.length * (cell + gap)
  const height = monthH + 7 * (cell + gap)

  const monthMarks: Array<{ index: number; label: string }> = []
  let lastMonth = ""
  weeks.forEach((week, index) => {
    for (const day of week) {
      const month = day.date.slice(0, 7)
      if (month !== lastMonth && (day.date.endsWith("-01") || index === 0)) {
        monthMarks.push({ index, label: monthShort(day.date) })
        lastMonth = month
        break
      }
      if (month !== lastMonth && day.date.slice(8, 10) <= "07") {
        monthMarks.push({ index, label: monthShort(day.date) })
        lastMonth = month
        break
      }
    }
  })

  function showTip(day: ActivityDay, rect: SVGRectElement) {
    const root = rect.ownerSVGElement?.parentElement
    if (!root) return
    const rootBox = root.getBoundingClientRect()
    const cellBox = rect.getBoundingClientRect()
    setTip({
      date: day.date,
      count: day.count,
      left: cellBox.left - rootBox.left + cellBox.width / 2,
      top: cellBox.top - rootBox.top,
    })
  }

  const legendSteps = [0, 0.25, 0.5, 0.75, 1]

  return (
    <section className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-mono text-[11px] tracking-[0.2em] text-muted uppercase">Activity</h2>
        <p className="font-mono text-[11px] text-muted tabular-nums">
          {total} score{total === 1 ? "" : "s"} in the last year
        </p>
      </div>
      <p className="mt-2 text-sm text-muted">Each cell is one day. +1 when you score a sentence.</p>

      <div className="relative mt-5 overflow-x-auto" onMouseLeave={() => setTip(null)}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="block min-w-[640px]"
          role="img"
          aria-label={`Activity heatmap, ${total} scores`}
        >
          {monthMarks.map((mark) => (
            <text
              key={`${mark.label}-${mark.index}`}
              x={labelW + mark.index * (cell + gap)}
              y={11}
              fill="var(--muted)"
              fontSize={10}
              fontFamily="var(--font-mono), ui-monospace, monospace"
            >
              {mark.label}
            </text>
          ))}

          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label, row) =>
            row % 2 === 1 ? (
              <text
                key={label}
                x={0}
                y={monthH + row * (cell + gap) + cell - 1}
                fill="var(--muted)"
                fontSize={9}
                fontFamily="var(--font-mono), ui-monospace, monospace"
              >
                {label}
              </text>
            ) : null,
          )}

          {weeks.map((week, weekIndex) =>
            week.map((day, row) => {
              const x = labelW + weekIndex * (cell + gap)
              const y = monthH + row * (cell + gap)
              const empty = day.count <= 0
              return (
                <rect
                  key={day.date}
                  x={x}
                  y={y}
                  width={cell}
                  height={cell}
                  rx={2}
                  fill={heatFill(day.count, maxCount)}
                  stroke="var(--line)"
                  strokeWidth={empty ? 1 : 0}
                  aria-describedby={tip?.date === day.date ? tipId : undefined}
                  onMouseEnter={(event) => showTip(day, event.currentTarget)}
                />
              )
            }),
          )}
        </svg>

        {tip ? (
          <div
            id={tipId}
            role="tooltip"
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md bg-ink px-2 py-1 font-mono text-[11px] whitespace-nowrap text-bg shadow-sm"
            style={{ left: tip.left, top: tip.top - 6 }}
          >
            {tip.date}: {tip.count} 次
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex items-center gap-1.5 font-mono text-[10px] text-muted">
        <span>Less</span>
        {legendSteps.map((step) => {
          const fill =
            step === 0 || maxCount === 0
              ? "var(--panel)"
              : heatFill(Math.max(1, Math.round(step * maxCount)), maxCount)
          return (
            <span
              key={step}
              className="inline-block size-2.5 rounded-[2px]"
              style={{
                background: fill,
                boxShadow: step === 0 || maxCount === 0 ? "inset 0 0 0 1px var(--line)" : undefined,
              }}
              aria-hidden="true"
            />
          )
        })}
        <span>More</span>
      </div>
    </section>
  )
}
