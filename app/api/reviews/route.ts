import { route } from "@/lib/api-error"
import { requirePassword } from "@/lib/auth"
import { createReview, listReviews } from "@/lib/reviews"

export function GET(request: Request) {
  return route(async () => {
    requirePassword(request)
    return Response.json({ reviews: await listReviews() })
  })
}

export function POST(request: Request) {
  return route(async () => {
    requirePassword(request)
    const deck = await createReview()
    return Response.json({ deck }, { status: 201 })
  })
}
