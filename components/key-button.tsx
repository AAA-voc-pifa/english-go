"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/cn"
import { useShortcut } from "@/components/shortcuts"

type Tone = "lime" | "ghost" | "score"

const PRESS_MS = 140

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
  const [flash, setFlash] = useState(false)
  const flashTimer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
    }
  }, [])

  function bump() {
    setFlash(true)
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => {
      setFlash(false)
      flashTimer.current = null
    }, PRESS_MS)
  }

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
        "inline-flex items-center justify-center gap-2 border text-sm select-none touch-manipulation",
        "transition-[transform,background-color,border-color,opacity,filter] duration-100 ease-out",
        "active:scale-[0.96] active:brightness-95",
        flash && "scale-[0.96] brightness-95",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 disabled:active:brightness-100",
        padding,
        height,
        tone === "lime" && "border-lime bg-lime font-medium text-lime-ink hover:bg-lime/90 active:bg-lime/75",
        tone === "ghost" &&
          (pressed
            ? "border-lime bg-panel text-lime active:bg-line/70"
            : "border-line bg-panel text-ink hover:border-ink/30 active:border-lime/50 active:bg-line/55"),
        tone === "score" &&
          (pressed
            ? "border-lime bg-lime font-medium text-lime-ink active:bg-lime/75"
            : "border-line bg-panel text-ink hover:border-lime/50 active:border-lime active:bg-lime/25"),
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
