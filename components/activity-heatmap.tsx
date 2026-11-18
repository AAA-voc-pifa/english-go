import type { ActivityDay } from "@/lib/types"

const HEAT = [
  "var(--panel)",
  "color-mix(in oklab, var(--lime) 22%, var(--panel))",
  "color-mix(in oklab, var(--lime) 40%, var(--panel))",
  "color-mix(in oklab, var(--lime) 62%, var(--panel))",
  "var(--lime)",
] as const

/** Absolute bands: a full deep/wide round is 9 scores. */
function heatLevel(count: number): number {
  if (count <= 0) return 0
  if (count <= 3) return 1
  if (count <= 8) return 2
  if (count <= 17) return 3
  return 4
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

export function ActivityHeatmap({ days, total }: { days: ActivityDay[]; total: number }) {
  const weeks = weeksFrom(days)
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

  return (
    <section className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-mono text-[11px] tracking-[0.2em] text-muted uppercase">Activity</h2>
        <p className="font-mono text-[11px] text-muted tabular-nums">
          {total} score{total === 1 ? "" : "s"} in the last year
        </p>
      </div>
      <p className="mt-2 text-sm text-muted">Each cell is one day. +1 when you score a sentence.</p>

      <div className="mt-5 overflow-x-auto">
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
              const level = heatLevel(day.count)
              return (
                <rect
                  key={day.date}
                  x={x}
                  y={y}
                  width={cell}
                  height={cell}
                  rx={2}
                  fill={HEAT[level]}
                  stroke="var(--line)"
                  strokeWidth={level === 0 ? 1 : 0}
                >
                  <title>
                    {day.date}: {day.count} score{day.count === 1 ? "" : "s"}
                  </title>
                </rect>
              )
            }),
          )}
        </svg>
      </div>

      <div className="mt-3 flex items-center gap-1.5 font-mono text-[10px] text-muted">
        <span>Less</span>
        {HEAT.map((fill, level) => (
          <span
            key={fill}
            className="inline-block size-2.5 rounded-[2px]"
            style={{
              background: fill,
              boxShadow: level === 0 ? "inset 0 0 0 1px var(--line)" : undefined,
            }}
            aria-hidden="true"
          />
        ))}
        <span>More</span>
      </div>
    </section>
  )
}
