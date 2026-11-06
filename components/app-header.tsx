"use client"

import { History, Settings, Star } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { NewRoundButton } from "@/components/new-round-button"
import { useShortcut } from "@/components/shortcuts"
import { cn } from "@/lib/cn"

export function AppHeader() {
  const router = useRouter()
  const pathname = usePathname()
  useShortcut("h", () => router.push("/history"))
  useShortcut("c", () => router.push("/sentences"))

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-2 px-2 sm:px-4">
        <Link href="/" className="shrink-0 font-mono text-[11px] tracking-[0.16em] text-ink uppercase sm:text-xs sm:tracking-[0.2em]">
          English Go
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <NewRoundButton label="New" tone="ghost" shortcut="n" compact />
          <Link
            href="/history"
            aria-current={pathname === "/history" ? "page" : undefined}
            aria-keyshortcuts="H"
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center gap-2 border border-line bg-panel text-sm sm:w-auto sm:px-3",
              pathname === "/history" ? "border-lime text-lime" : "text-ink",
            )}
          >
            <History aria-hidden="true" className="size-4" />
            <span className="max-sm:sr-only">History</span>
            <kbd className="hidden h-5 min-w-5 place-items-center border border-current/30 px-1 font-mono text-[10px] leading-none sm:inline-grid">
              H
            </kbd>
          </Link>
          <Link
            href="/sentences"
            aria-current={pathname === "/sentences" ? "page" : undefined}
            aria-keyshortcuts="C"
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center gap-2 border border-line bg-panel text-sm sm:w-auto sm:px-3",
              pathname === "/sentences" ? "border-lime text-lime" : "text-ink",
            )}
          >
            <Star aria-hidden="true" className="size-4" />
            <span className="max-sm:sr-only">Favourites</span>
            <kbd className="hidden h-5 min-w-5 place-items-center border border-current/30 px-1 font-mono text-[10px] leading-none sm:inline-grid">
              C
            </kbd>
          </Link>
          <Link
            href="/settings"
            aria-current={pathname === "/settings" ? "page" : undefined}
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center gap-2 border border-line bg-panel text-sm sm:w-auto sm:px-3",
              pathname === "/settings" ? "border-lime text-lime" : "text-ink",
            )}
          >
            <Settings aria-hidden="true" className="size-4" />
            <span className="max-sm:sr-only">Settings</span>
          </Link>
        </nav>
      </div>
    </header>
  )
}
