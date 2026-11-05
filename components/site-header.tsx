"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { CreateQuizButton } from "@/components/create-quiz-button"
import { useShortcut } from "@/components/shortcuts"

export function SiteHeader() {
  const router = useRouter()
  useShortcut("h", () => router.push("/history"))

  return (
    <header className="border-b border-line">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 py-4">
        <div className="flex items-center gap-2">
          <CreateQuizButton label="New quiz" shortcut="n" tone="quiet" />
          <Link
            href="/history"
            className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-card px-3 text-sm text-ink"
          >
            练习记录
            <kbd className="inline-grid h-5 min-w-5 place-items-center rounded border border-current/25 px-1 font-mono text-[11px] leading-none">
              H
            </kbd>
          </Link>
        </div>
        <Link href="/" className="font-serif text-2xl italic tracking-tight text-ink">
          English Go
        </Link>
        <div className="flex justify-end">
          <Link
            href="/settings"
            className="inline-flex h-11 items-center rounded-full border border-line bg-card px-3 text-sm text-ink"
          >
            设置
          </Link>
        </div>
      </div>
    </header>
  )
}
