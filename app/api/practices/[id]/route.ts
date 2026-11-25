import { route } from "@/lib/api-error"
import { requirePassword } from "@/lib/auth"
import { getPractice, setPracticeCursor } from "@/lib/practices"
import { isRecord } from "@/lib/is-record"

type Context = { params: Promise<{ id: string }> }

export function GET(request: Request, context: Context) {
  return route(async () => {
    requirePassword(request)
    const { id } = await context.params
    return Response.json({ deck: await getPractice(id) })
  })
}

export function PATCH(request: Request, context: Context) {
  return route(async () => {
    requirePassword(request)
    const { id } = await context.params
    const body: unknown = await request.json().catch(() => null)
    if (!isRecord(body) || typeof body.cursor !== "number") {
      return Response.json({ error: "Nothing to update" }, { status: 400 })
    }
    return Response.json({ deck: await setPracticeCursor(id, body.cursor) })
  })
}
