import { Sentence } from "@/components/sentence"
import { speechLabel } from "@/hooks/use-line-audio"
import { AWARD_LABEL, type Round } from "@/lib/types"

export function ReviewSheet({
  round,
  speechTarget,
  phase,
  soundError,
  onSpeak,
}: {
  round: Round
  speechTarget: string | null
  phase: "idle" | "loading" | "playing"
  soundError: string | null
  onSpeak: (lineId: string) => void
}) {
  const gained = round.lines.reduce((sum, line) => sum + (line.award ?? 0), 0)
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-[0.18em] text-good uppercase">已完成</p>
          <h1 className="mt-2 text-3xl tracking-tight">一共加上 {gained} points</h1>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
          {round.words.map((item) => (
            <li key={item.word}>
              <span className="font-serif text-base text-ink">{item.word}</span>{" "}
              <span className="font-mono text-xs tabular-nums">{item.points}</span>
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
        {round.lines.map((line, index) => (
          <li key={line.id} className="grid grid-cols-[auto_1fr] gap-4 py-4">
            <span className="pt-1 font-mono text-xs text-muted tabular-nums">{String(index + 1).padStart(2, "0")}</span>
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-serif text-lg">{line.word}</span>
                <span className="font-mono text-xs text-muted tabular-nums">
                  {line.award === null ? "未打分" : `+${line.award} ${AWARD_LABEL[line.award]}`}
                </span>
              </div>
              <Sentence en={line.en} word={line.word} size="review" />
              <p lang="zh-CN" className="text-sm leading-6 text-muted">
                {line.zh}
              </p>
              <button
                type="button"
                onClick={() => onSpeak(line.id)}
                disabled={phase === "loading" && speechTarget === line.id}
                className="mt-1 inline-flex h-8 items-center self-start border border-line bg-panel px-3 text-xs text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                {speechLabel(line.id, speechTarget, phase)}
              </button>
            </div>
          </li>
        ))}
      </ol>
    </main>
  )
}
