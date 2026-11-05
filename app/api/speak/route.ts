import { route } from "@/lib/api-error"
import { requirePassword } from "@/lib/auth"
import { lineSentence } from "@/lib/rounds"
import { getSettings } from "@/lib/settings"
import { synthesize } from "@/lib/tts"

export function GET(request: Request) {
  return route(async () => {
    requirePassword(request)
    const line = new URL(request.url).searchParams.get("line")?.trim() ?? ""
    if (!line) return Response.json({ error: "没有要读的句子" }, { status: 400 })
    const text = await lineSentence(line)
    const settings = await getSettings()
    return synthesize(text, settings)
  })
}
