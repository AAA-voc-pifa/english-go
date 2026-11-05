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
  awardPending,
  onPrev,
  onNext,
  onSpeak,
  onReveal,
  onAward,
}: {
  canPrev: boolean
  canNext: boolean
  speechLabel: string
  speechPending: boolean
  revealed: boolean
  award: Award | null
  awardPending: boolean
  onPrev: () => void
  onNext: () => void
  onSpeak: () => void
  onReveal: () => void
  onAward: (points: Award) => void
}) {
  return (
    <div className="sticky bottom-0 z-10 border-t border-line bg-bg/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-2 px-4 py-3">
        <KeyButton shortcut="j" onClick={onPrev} disabled={!canPrev}>
          上一题
        </KeyButton>
        <KeyButton shortcut="k" onClick={onNext} disabled={!canNext}>
          下一题
        </KeyButton>
        <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden="true" />
        <KeyButton shortcut="p" onClick={onSpeak} disabled={speechPending}>
          {speechLabel}
        </KeyButton>
        <KeyButton shortcut="r" onClick={onReveal} pressed={revealed}>
          {revealed ? "收起译文" : "显示译文"}
        </KeyButton>
        <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden="true" />
        <div className="flex flex-wrap gap-2" role="group" aria-label="给这个单词加分">
          {SCORES.map((item) => (
            <KeyButton
              key={item.points}
              shortcut={item.shortcut}
              tone="score"
              pressed={award === item.points}
              disabled={awardPending || (award !== null && award !== item.points)}
              onClick={() => onAward(item.points)}
            >
              <span className="tabular-nums">+{item.points}</span>
              <span className={award === item.points ? "text-lime-ink/70" : "text-muted"}>{AWARD_LABEL[item.points]}</span>
            </KeyButton>
          ))}
        </div>
      </div>
    </div>
  )
}
