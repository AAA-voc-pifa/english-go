import { route } from "@/lib/api-error"
import { requirePassword } from "@/lib/auth"
import { ensureMnemonic, listMnemonics } from "@/lib/mnemonics"
import { readCursor, readLimit, readQuery } from "@/lib/query"

export const maxDuration = 180

export function GET(request: Request) {
  return route(async () => {
    requirePassword(request)
    const url = new URL(request.url)
    const { mnemonics, nextCursor } = await listMnemonics(
      readLimit(url),
      readCursor(url),
      readQuery(url),
    )
    return Response.json({ mnemonics, nextCursor })
  })
}

export function POST(request: Request) {
  return route(async () => {
    requirePassword(request)
    const body = (await request.json().catch(() => null)) as { word?: unknown } | null
    const word = typeof body?.word === "string" ? body.word.trim() : ""
    if (!word) return Response.json({ error: "Nothing to remember" }, { status: 400 })
    const result = await ensureMnemonic(word)
    return Response.json(
      { word, data: result.data, created: result.created },
      { status: result.created ? 201 : 200 },
    )
  })
}
