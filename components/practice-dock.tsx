import { ChevronLeft, ChevronRight, Languages, Star, Volume2 } from "lucide-react"
import { KeyButton } from "@/components/key-button"
import { AWARD_LABEL, type Award } from "@/lib/types"

const SCORES: Array<{ shortcut: string; points: Award }> = [
  { shortcut: "a", points: 5 },
  { shortcut: "s", points: 10 },
  { shortcut: "d", points: 15 },
]

export function PracticeDock({
  canPrev,
  canNext,
  speechLabel,
  speechPending,
  revealed,
  award,
  starred,
  starPending,
  onPrev,
  onNext,
  onSpeak,
  onReveal,
  onAward,
  onStar,
  scoreLabel,
}: {
  canPrev: boolean
  canNext: boolean
  speechLabel: string
  speechPending: boolean
  revealed: boolean
  award: Award | null
  starred?: boolean
  starPending?: boolean
  onPrev: () => void
  onNext: () => void
  onSpeak: () => void
  onReveal: () => void
  onAward: (points: Award) => void
  onStar?: () => void
  scoreLabel: string
}) {
  return (
    <div className="sticky bottom-0 z-10 border-t border-line bg-bg/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:px-4 sm:py-3">
        <div className="order-2 grid grid-cols-5 gap-1.5 sm:order-none sm:contents">
          <KeyButton shortcut="j" onClick={onPrev} disabled={!canPrev} className="h-11 w-full px-0 sm:h-10 sm:w-auto sm:px-3">
            <ChevronLeft aria-hidden="true" className="size-5 sm:hidden" />
            <span className="max-sm:sr-only">Previous</span>
          </KeyButton>
          <KeyButton shortcut="k" onClick={onNext} disabled={!canNext} className="h-11 w-full px-0 sm:h-10 sm:w-auto sm:px-3">
            <ChevronRight aria-hidden="true" className="size-5 sm:hidden" />
            <span className="max-sm:sr-only">Next</span>
          </KeyButton>
          <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden="true" />
          <KeyButton shortcut="p" onClick={onSpeak} disabled={speechPending} className="h-11 w-full px-0 sm:h-10 sm:w-auto sm:px-3">
            <Volume2 aria-hidden="true" className="size-5 sm:hidden" />
            <span className="max-sm:sr-only sm:inline">{speechLabel}</span>
          </KeyButton>
          <KeyButton shortcut="r" onClick={onReveal} pressed={revealed} className="h-11 w-full px-0 sm:h-10 sm:w-auto sm:px-3">
            <Languages aria-hidden="true" className="size-5 sm:hidden" />
            <span className="max-sm:sr-only">{revealed ? "Hide" : "Translation"}</span>
          </KeyButton>
          {onStar ? (
            <KeyButton
              shortcut="f"
              onClick={onStar}
              pressed={starred}
              disabled={starPending || starred}
              className="h-11 w-full px-0 sm:h-10 sm:w-auto sm:px-3"
            >
              <Star aria-hidden="true" className={starred ? "size-5 fill-current sm:size-4" : "size-5 sm:size-4"} />
              <span className="max-sm:sr-only">{starred ? "Starred" : starPending ? "Starring" : "Star"}</span>
            </KeyButton>
          ) : (
            <span className="sm:hidden" />
          )}
        </div>
        <div className="order-1 grid grid-cols-3 gap-2 sm:order-none sm:contents" role="group" aria-label={scoreLabel}>
          <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden="true" />
          {SCORES.map((item) => (
            <KeyButton
              key={item.points}
              shortcut={item.shortcut}
              tone="score"
              pressed={award === item.points}
              disabled={award !== null && award !== item.points}
              onClick={() => onAward(item.points)}
              className="h-12 w-full px-1 sm:h-10 sm:w-auto sm:px-3"
            >
              <span className="flex flex-col items-center gap-0.5 leading-none sm:flex-row sm:gap-2 sm:leading-normal">
                <span className="tabular-nums">+{item.points}</span>
                <span className={award === item.points ? "text-[10px] text-lime-ink/70 sm:text-sm" : "text-[10px] text-muted sm:text-sm"}>
                  {AWARD_LABEL[item.points]}
                </span>
              </span>
            </KeyButton>
          ))}
        </div>
      </div>
    </div>
  )
}
