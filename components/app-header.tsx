"use client"

import type { ReactNode } from "react"
import { BookMarked, ChartColumn, List, Settings, Star } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { NewRoundButton } from "@/components/new-round-button"
import { useShortcut } from "@/components/shortcuts"
import { usePressFlash } from "@/hooks/use-press-flash"
import { cn } from "@/lib/cn"
import { controlBase, controlPress } from "@/lib/control"

function HeaderNavLink({
  href,
  shortcut,
  label,
  icon,
}: {
  href: string
  shortcut?: string
  label: string
  icon: ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const current = pathname === href
  const { flash, bump } = usePressFlash()

  useShortcut(
    shortcut ?? "_",
    () => {
      bump()
      router.push(href)
    },
    Boolean(shortcut),
  )

  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      aria-keyshortcuts={shortcut ? shortcut.toUpperCase() : undefined}
      onClick={bump}
      className={cn(
        controlBase("h-10 w-10 bg-panel sm:w-auto sm:px-3"),
        controlPress(flash),
        current ? "border-lime text-lime" : "border-line text-ink hover:border-ink/30 active:border-lime/40 active:bg-line/50",
      )}
    >
      {icon}
      <span className="max-sm:sr-only">{label}</span>
      {shortcut ? (
        <kbd className="hidden h-5 min-w-5 place-items-center border border-current/30 px-1 font-mono text-[10px] leading-none sm:inline-grid">
          {shortcut.toUpperCase()}
        </kbd>
      ) : null}
    </Link>
  )
}

export function AppHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-2 px-2 sm:px-4">
        <Link href="/" className="shrink-0 font-mono text-[11px] tracking-[0.16em] text-ink uppercase sm:text-xs sm:tracking-[0.2em]">
          English Go
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <NewRoundButton label="New" tone="ghost" shortcut="n" compact />
          <HeaderNavLink href="/practices" shortcut="h" label="Practices" icon={<List aria-hidden="true" className="size-4" />} />
          <HeaderNavLink href="/sentences" shortcut="c" label="Favourites" icon={<Star aria-hidden="true" className="size-4" />} />
          <HeaderNavLink href="/mnemonics" label="Mnemonics" icon={<BookMarked aria-hidden="true" className="size-4" />} />
          <HeaderNavLink href="/stats" shortcut="t" label="Stats" icon={<ChartColumn aria-hidden="true" className="size-4" />} />
          <HeaderNavLink href="/settings" label="Settings" icon={<Settings aria-hidden="true" className="size-4" />} />
        </nav>
      </div>
    </header>
  )
}
