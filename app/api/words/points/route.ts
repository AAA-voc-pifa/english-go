import { ApiError, route } from "@/lib/api-error"
import { requirePassword } from "@/lib/auth"
import { increaseWordPoints } from "@/lib/voc"
import { isRecord } from "@/lib/is-record"

export function POST(request: Request) {
  return route(async () => {
    requirePassword(request)
    const body: unknown = await request.json().catch(() => null)
    if (!isRecord(body)) throw new ApiError("Bad request", 400)

    const word = typeof body.word === "string" ? body.word.trim() : ""
    if (!word) throw new ApiError("Word is required", 400)

    const points = body.points
    if (typeof points !== "number" || !Number.isInteger(points) || points < 1) {
      throw new ApiError("Points must be a positive integer", 400)
    }

    const next = await increaseWordPoints(word, points)
    return Response.json({ word, points: next })
  })
}
