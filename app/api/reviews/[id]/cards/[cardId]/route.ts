import { route } from "@/lib/api-error"
import { requirePassword } from "@/lib/auth"
import { isRecord } from "@/lib/is-record"
import { awardReviewCard } from "@/lib/reviews"

type Context = { params: Promise<{ id: string; cardId: string }> }

export function PATCH(request: Request, context: Context) {
  return route(async () => {
    requirePassword(request)
    const { id, cardId } = await context.params
    const body: unknown = await request.json().catch(() => null)
    if (!isRecord(body)) return Response.json({ error: "Bad request" }, { status: 400 })

    if (typeof body.award === "number") {
      return Response.json(await awardReviewCard(id, cardId, body.award))
    }

    return Response.json({ error: "Nothing to update" }, { status: 400 })
  })
}
