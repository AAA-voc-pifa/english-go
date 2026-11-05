import { route } from "@/lib/api-error"
import { getRound, setCursor } from "@/lib/rounds"

type Context = { params: Promise<{ id: string }> }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function GET(_request: Request, context: Context) {
  return route(async () => {
    const { id } = await context.params
    return Response.json({ round: await getRound(id) })
  })
}

export function PATCH(request: Request, context: Context) {
  return route(async () => {
    const { id } = await context.params
    const body: unknown = await request.json().catch(() => null)
    if (!isRecord(body) || typeof body.cursor !== "number") {
      return Response.json({ error: "没有要更新的内容" }, { status: 400 })
    }
    return Response.json({ round: await setCursor(id, body.cursor) })
  })
}
