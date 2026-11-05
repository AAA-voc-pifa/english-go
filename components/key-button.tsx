"use client"

import { cn } from "@/lib/cn"
import { useShortcut } from "@/components/shortcuts"

type Tone = "lime" | "ghost" | "score"

export function KeyButton({
  shortcut,
  onClick,
  disabled = false,
  pressed = false,
  tone = "ghost",
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
        "inline-flex h-10 items-center justify-center gap-2 border px-3 text-sm disabled:cursor-not-allowed disabled:opacity-40",
        tone === "lime" && "border-lime bg-lime font-medium text-lime-ink hover:bg-lime/90",
        tone === "ghost" &&
          (pressed ? "border-lime bg-panel text-lime" : "border-line bg-panel text-ink hover:border-ink/30"),
        tone === "score" &&
          (pressed
            ? "border-lime bg-lime font-medium text-lime-ink"
            : "border-line bg-panel text-ink hover:border-lime/50"),
      )}
    >
      {children}
      {shortcut ? (
        <kbd className="inline-grid h-5 min-w-5 place-items-center border border-current/30 px-1 font-mono text-[10px] leading-none">
          {shortcut.toUpperCase()}
        </kbd>
      ) : null}
    </button>
  )
}
