import { Sentence } from "@/components/sentence"
import { speechLabel } from "@/hooks/use-line-audio"
import { AWARD_LABEL, type Deck } from "@/lib/types"

export function ResultSheet({
  deck,
  speechTarget,
  phase,
  soundError,
  onSpeak,
  onSave,
}: {
  deck: Deck
  speechTarget: string | null
  phase: "idle" | "loading" | "playing"
  soundError: string | null
  onSpeak: (cardId: string) => void
  onSave?: (cardId: string) => void
}) {
  const gained = deck.cards.reduce((sum, card) => sum + (card.award ?? 0), 0)
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-[0.18em] text-good uppercase">Done</p>
          <h1 className="mt-2 text-3xl tracking-tight">+{gained} points</h1>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
          {deck.groups.map((group) => (
            <li key={group.key}>
              <span className="font-serif text-base text-ink">{group.label}</span>{" "}
              <span className="font-mono text-xs tabular-nums">{group.points}</span>
            </li>
          ))}
        </ul>
      </div>
      {soundError ? (
        <p role="alert" className="text-sm text-hot">
          {soundError}
        </p>
      ) : null}
      <ol className="divide-y divide-line border-y border-line">
        {deck.cards.map((card, index) => (
          <li key={card.id} className="grid grid-cols-[auto_1fr] gap-4 py-4">
            <span className="pt-1 font-mono text-xs text-muted tabular-nums">{String(index + 1).padStart(2, "0")}</span>
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-serif text-lg">{card.word}</span>
                <span className="font-mono text-xs text-muted tabular-nums">
                  {card.award === null ? "Unscored" : `+${card.award} ${AWARD_LABEL[card.award]}`}
                </span>
              </div>
              <Sentence en={card.en} word={card.word} size="review" />
              <p lang="zh-CN" className="text-sm leading-6 text-muted">
                {card.zh}
              </p>
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  onClick={() => onSpeak(card.id)}
                  disabled={phase === "loading" && speechTarget === card.id}
                  className="inline-flex h-8 items-center border border-line bg-panel px-3 text-xs text-ink disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {speechLabel(card.id, speechTarget, phase)}
                </button>
                {onSave ? (
                  <button
                    type="button"
                    onClick={() => onSave(card.id)}
                    disabled={card.saved}
                    className="inline-flex h-8 items-center border border-line bg-panel px-3 text-xs text-ink disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {card.saved ? "Saved" : "Save"}
                  </button>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </main>
  )
}
