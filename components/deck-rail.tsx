import { cn } from "@/lib/cn"
import type { Award, DeckGroup } from "@/lib/types"

export function DeckRail({
  groups,
  cards,
  currentId,
}: {
  groups: DeckGroup[]
  cards: Array<{ id: string; award: Award | null }>
  currentId: string
}) {
  const byId = new Map(cards.map((card) => [card.id, card]))
  const compact = groups.length > 3
  return (
    <aside className="min-w-0 border-b border-line lg:max-h-[calc(100dvh-3.5rem)] lg:overflow-y-auto lg:border-r lg:border-b-0">
      <ol className="grid grid-cols-3 gap-2 px-3 py-2 lg:flex lg:flex-col lg:gap-0 lg:px-0 lg:py-3">
        {groups.map((group) => {
          const active = group.cardIds.includes(currentId)
          return (
            <li
              key={group.key}
              className={cn(
                "min-w-0 border px-2 lg:border-0 lg:border-l-2 lg:px-4",
                compact ? "py-1.5 lg:py-2" : "py-2 lg:py-3",
                active ? "border-lime bg-panel lg:border-l-lime" : "border-line lg:border-l-transparent",
              )}
            >
              <div className="flex min-w-0 items-baseline justify-between gap-2">
                <span
                  className={cn(
                    "min-w-0 truncate font-serif tracking-tight",
                    compact ? "text-base lg:text-lg" : "text-lg lg:text-xl",
                  )}
                >
                  {group.label}
                </span>
                <span className="font-mono text-xs text-muted tabular-nums">{group.points}</span>
              </div>
              <div className={cn("flex gap-1", compact ? "mt-1.5 lg:mt-2" : "mt-2 lg:mt-3")} aria-hidden="true">
                {group.cardIds.map((id) => {
                  const card = byId.get(id)
                  return (
                    <span
                      key={id}
                      className={cn(
                        "h-1 flex-1",
                        id === currentId ? "bg-lime" : card?.award != null ? "bg-good" : "bg-line",
                      )}
                    />
                  )
                })}
              </div>
            </li>
          )
        })}
      </ol>
    </aside>
  )
}
