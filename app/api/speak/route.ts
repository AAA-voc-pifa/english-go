import { route } from "@/lib/api-error"
import { requirePassword } from "@/lib/auth"
import { cardSentence } from "@/lib/practices"
import { getSettings } from "@/lib/settings"
import { synthesize } from "@/lib/tts"

export function GET(request: Request) {
  return route(async () => {
    requirePassword(request)
    const card = new URL(request.url).searchParams.get("card")?.trim() ?? ""
    if (!card) return Response.json({ error: "Nothing to read" }, { status: 400 })
    const text = await cardSentence(card)
    const settings = await getSettings()
    return synthesize(text, settings)
  })
}
