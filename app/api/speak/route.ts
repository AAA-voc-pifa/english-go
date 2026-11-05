import { route } from "@/lib/api-error"
import { requirePassword } from "@/lib/auth"
import { quizHasSentence } from "@/lib/quizzes"
import { getSettings } from "@/lib/settings"
import { synthesize } from "@/lib/tts"

export function GET(request: Request) {
  return route(async () => {
    requirePassword(request)
    const text = new URL(request.url).searchParams.get("text")?.trim() ?? ""
    if (!text) return Response.json({ error: "没有要读的句子" }, { status: 400 })
    if (text.length > 800) return Response.json({ error: "句子太长了" }, { status: 400 })
    if (!(await quizHasSentence(text))) {
      return Response.json({ error: "这句话不在练习里" }, { status: 404 })
    }
    const settings = await getSettings()
    return synthesize(text, settings)
  })
}
