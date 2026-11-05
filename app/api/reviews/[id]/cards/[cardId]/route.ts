import { route } from "@/lib/api-error"
import { requirePassword } from "@/lib/auth"
import { awardReviewCard, setReviewRevealed } from "@/lib/reviews"

type Context = { params: Promise<{ id: string; cardId: string }> }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function PATCH(request: Request, context: Context) {
  return route(async () => {
    const { id, cardId } = await context.params
    const body: unknown = await request.json().catch(() => null)
    if (!isRecord(body)) return Response.json({ error: "Bad request" }, { status: 400 })

    if (typeof body.revealed === "boolean") {
      return Response.json({ deck: await setReviewRevealed(id, cardId, body.revealed) })
    }

    if (typeof body.award === "number") {
      requirePassword(request)
      return Response.json({ deck: await awardReviewCard(id, cardId, body.award) })
    }

    return Response.json({ error: "Nothing to update" }, { status: 400 })
  })
}
