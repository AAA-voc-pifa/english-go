import { route } from "@/lib/api-error"
import { requirePassword } from "@/lib/auth"
import { awardLine, setRevealed } from "@/lib/rounds"

type Context = { params: Promise<{ id: string; lineId: string }> }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function PATCH(request: Request, context: Context) {
  return route(async () => {
    const { id, lineId } = await context.params
    const body: unknown = await request.json().catch(() => null)
    if (!isRecord(body)) {
      return Response.json({ error: "请求格式不对" }, { status: 400 })
    }

    if (typeof body.revealed === "boolean") {
      return Response.json({ round: await setRevealed(id, lineId, body.revealed) })
    }

    if (typeof body.award === "number") {
      requirePassword(request)
      return Response.json({ round: await awardLine(id, lineId, body.award) })
    }

    return Response.json({ error: "没有要更新的内容" }, { status: 400 })
  })
}
