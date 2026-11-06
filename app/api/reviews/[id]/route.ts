import { route } from "@/lib/api-error"
import { requirePassword } from "@/lib/auth"
import { getReview, setReviewCursor } from "@/lib/reviews"

type Context = { params: Promise<{ id: string }> }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function GET(request: Request, context: Context) {
  return route(async () => {
    requirePassword(request)
    const { id } = await context.params
    return Response.json({ deck: await getReview(id) })
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
    return Response.json({ deck: await setReviewCursor(id, body.cursor) })
  })
}
