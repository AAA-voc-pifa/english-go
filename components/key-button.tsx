"use client"

import { cn } from "@/lib/cn"
import { useShortcut } from "@/components/shortcuts"
import { usePressFlash } from "@/hooks/use-press-flash"
import { controlBase, controlPress } from "@/lib/control"

type Tone = "lime" | "ghost" | "score"

export function KeyButton({
  shortcut,
  onClick,
  disabled = false,
  pressed = false,
  tone = "ghost",
  autoFocus = false,
  className,
  children,
}: {
  shortcut?: string
  onClick: () => void
  disabled?: boolean
  pressed?: boolean
  tone?: Tone
  autoFocus?: boolean
  className?: string
  children: React.ReactNode
}) {
  const { flash, bump } = usePressFlash()

  function fire() {
    if (disabled) return
    bump()
    onClick()
  }

  useShortcut(shortcut ?? "_", fire, Boolean(shortcut) && !disabled)

  const sizing = className ?? ""
  const padding = /\b!?p[xy]?-/.test(sizing) ? "" : "px-3"
  const height = /\b!?h-|\b!?size-|\b!?min-h-/.test(sizing) ? "" : "h-11 sm:h-10"

  return (
    <button
      type="button"
      onClick={fire}
      disabled={disabled}
      autoFocus={autoFocus}
      aria-keyshortcuts={shortcut ? shortcut.toUpperCase() : undefined}
      aria-pressed={pressed}
      className={cn(
        controlBase(),
        controlPress(flash),
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 disabled:active:brightness-100",
        padding,
        height,
        tone === "lime" && "border-lime bg-lime font-medium text-lime-ink hover:bg-lime/90 active:bg-lime/80",
        tone === "ghost" &&
          (pressed
            ? "border-lime bg-panel text-lime active:bg-line/50"
            : "border-line bg-panel text-ink hover:border-ink/30 active:border-lime/40 active:bg-line/50"),
        tone === "score" &&
          (pressed
            ? "border-lime bg-lime font-medium text-lime-ink active:bg-lime/80"
            : "border-line bg-panel text-ink hover:border-lime/50 active:border-lime/70 active:bg-lime/20"),
        className,
      )}
    >
      {children}
      {shortcut ? (
        <kbd className="hidden h-5 min-w-5 place-items-center border border-current/30 px-1 font-mono text-[10px] leading-none sm:inline-grid">
          {shortcut.toUpperCase()}
        </kbd>
      ) : null}
    </button>
  )
}
