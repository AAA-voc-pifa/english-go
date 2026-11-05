import { cn } from "@/lib/cn"
import type { Line, RoundWord } from "@/lib/types"

export function WordRail({
  words,
  lines,
  currentLineId,
}: {
  words: RoundWord[]
  lines: Line[]
  currentLineId: string
}) {
  const current = lines.find((line) => line.id === currentLineId)
  return (
    <aside className="border-b border-line lg:border-r lg:border-b-0">
      <ol className="flex gap-2 overflow-x-auto px-4 py-3 lg:flex-col lg:gap-0 lg:overflow-visible lg:px-0 lg:py-3">
        {words.map((item) => {
          const related = lines.filter((line) => line.word === item.word)
          const active = item.word === current?.word
          return (
            <li
              key={item.word}
              className={cn(
                "min-w-44 shrink-0 border px-3 py-3 lg:min-w-0 lg:border-0 lg:border-l-2 lg:px-4",
                active ? "border-lime bg-panel lg:border-l-lime" : "border-line lg:border-l-transparent",
              )}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-serif text-xl tracking-tight">{item.word}</span>
                <span className="font-mono text-xs text-muted tabular-nums">{item.points}</span>
              </div>
              <div className="mt-3 flex gap-1" aria-hidden="true">
                {related.map((line) => (
                  <span
                    key={line.id}
                    className={cn(
                      "h-1 flex-1",
                      line.id === currentLineId ? "bg-lime" : line.award !== null ? "bg-good" : "bg-line",
                    )}
                  />
                ))}
              </div>
            </li>
          )
        })}
      </ol>
    </aside>
  )
}
