import { route } from "@/lib/api-error"
import { requirePassword } from "@/lib/auth"
import { awardPracticeLine } from "@/lib/practices"

type Context = { params: Promise<{ id: string; lineId: string }> }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function PATCH(request: Request, context: Context) {
  return route(async () => {
    requirePassword(request)
    const { id, lineId } = await context.params
    const body: unknown = await request.json().catch(() => null)
    if (!isRecord(body)) return Response.json({ error: "Bad request" }, { status: 400 })

    if (typeof body.award === "number") {
      return Response.json({ deck: await awardPracticeLine(id, lineId, body.award) })
    }

    return Response.json({ error: "Nothing to update" }, { status: 400 })
  })
}
