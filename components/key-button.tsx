"use client"

import { cn } from "@/lib/cn"
import { useShortcut } from "@/components/shortcuts"

type Tone = "solid" | "quiet" | "score"

export function KeyButton({
  shortcut,
  onClick,
  disabled = false,
  pressed = false,
  tone = "quiet",
  children,
}: {
  shortcut?: string
  onClick: () => void
  disabled?: boolean
  pressed?: boolean
  tone?: Tone
  children: React.ReactNode
}) {
  useShortcut(shortcut ?? "_", onClick, Boolean(shortcut) && !disabled)

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-keyshortcuts={shortcut ? shortcut.toUpperCase() : undefined}
      aria-pressed={pressed}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        tone === "solid" && "bg-ink text-paper hover:bg-ink/90",
        tone === "quiet" && "border border-line bg-card text-ink hover:border-ink/30",
        tone === "score" &&
          (pressed
            ? "border border-ink bg-ink text-paper"
            : "border border-line bg-card text-ink hover:border-ink/30"),
      )}
    >
      {children}
      {shortcut ? (
        <kbd className="inline-grid h-5 min-w-5 place-items-center rounded border border-current/25 px-1 font-mono text-[11px] leading-none">
          {shortcut.toUpperCase()}
        </kbd>
      ) : null}
    </button>
  )
}
