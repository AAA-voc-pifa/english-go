"use client"

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
      <div className="mx-auto flex min-h-14 w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2">
        <Link href="/" className="font-mono text-xs tracking-[0.2em] text-ink uppercase">
          English Go
        </Link>
        <nav className="flex items-center gap-2">
          <NewRoundButton label="New" tone="ghost" shortcut="n" />
          <Link
            href="/history"
            aria-current={pathname === "/history" ? "page" : undefined}
            className={cn(
              "inline-flex h-10 items-center gap-2 border border-line bg-panel px-3 text-sm",
              pathname === "/history" ? "border-lime text-lime" : "text-ink",
            )}
          >
            History
            <kbd className="inline-grid h-5 min-w-5 place-items-center border border-current/30 px-1 font-mono text-[10px] leading-none">
              H
            </kbd>
          </Link>
          <Link
            href="/sentences"
            aria-current={pathname === "/sentences" ? "page" : undefined}
            className={cn(
              "inline-flex h-10 items-center gap-2 border border-line bg-panel px-3 text-sm",
              pathname === "/sentences" ? "border-lime text-lime" : "text-ink",
            )}
          >
            Sentences
            <kbd className="inline-grid h-5 min-w-5 place-items-center border border-current/30 px-1 font-mono text-[10px] leading-none">
              C
            </kbd>
          </Link>
          <Link
            href="/settings"
            aria-current={pathname === "/settings" ? "page" : undefined}
            className={cn(
              "inline-flex h-10 items-center border border-line bg-panel px-3 text-sm",
              pathname === "/settings" ? "border-lime text-lime" : "text-ink",
            )}
          >
            Settings
          </Link>
        </nav>
      </div>
    </header>
  )
}
