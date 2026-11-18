import { route } from "@/lib/api-error"
import { requirePassword } from "@/lib/auth"
import { ensureMnemonic } from "@/lib/mnemonics"

export const maxDuration = 90

export function POST(request: Request) {
  return route(async () => {
    requirePassword(request)
    const body = (await request.json().catch(() => null)) as { word?: unknown } | null
    const word = typeof body?.word === "string" ? body.word.trim() : ""
    if (!word) return Response.json({ error: "Nothing to remember" }, { status: 400 })
    const result = await ensureMnemonic(word)
    return Response.json(
      { word, text: result.text, created: result.created },
      { status: result.created ? 201 : 200 },
    )
  })
}
