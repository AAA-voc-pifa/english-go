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
  return (
    <aside className="border-b border-line lg:border-r lg:border-b-0">
      <ol className="flex gap-2 overflow-x-auto px-4 py-3 lg:flex-col lg:gap-0 lg:overflow-visible lg:px-0 lg:py-3">
        {groups.map((group) => {
          const active = group.cardIds.includes(currentId)
          return (
            <li
              key={group.key}
              className={cn(
                "min-w-44 shrink-0 border px-3 py-3 lg:min-w-0 lg:border-0 lg:border-l-2 lg:px-4",
                active ? "border-lime bg-panel lg:border-l-lime" : "border-line lg:border-l-transparent",
              )}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-serif text-xl tracking-tight">{group.label}</span>
                <span className="font-mono text-xs text-muted tabular-nums">{group.points}</span>
              </div>
              <div className="mt-3 flex gap-1" aria-hidden="true">
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
