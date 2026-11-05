import { route } from "@/lib/api-error"
import { getSettings, updateSettings } from "@/lib/settings"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function GET() {
  return route(async () => {
    const settings = await getSettings()
    return Response.json({ settings })
  })
}

export function PATCH(request: Request) {
  return route(async () => {
    const body: unknown = await request.json().catch(() => null)
    if (!isRecord(body)) {
      return Response.json({ error: "请求格式不对" }, { status: 400 })
    }

    const patch: { autoSpeak?: boolean; voice?: string; rate?: string } = {}
    if (typeof body.autoSpeak === "boolean") patch.autoSpeak = body.autoSpeak
    if (typeof body.voice === "string") patch.voice = body.voice
    if (typeof body.rate === "string") patch.rate = body.rate
    if (patch.autoSpeak === undefined && patch.voice === undefined && patch.rate === undefined) {
      return Response.json({ error: "没有要更新的内容" }, { status: 400 })
    }

    const settings = await updateSettings(patch)
    return Response.json({ settings })
  })
}
