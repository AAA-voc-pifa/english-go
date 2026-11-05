import { route } from "@/lib/api-error"
import { requirePassword } from "@/lib/auth"
import { createPractice, listPractices } from "@/lib/practices"

export const maxDuration = 120

export function GET() {
  return route(async () => {
    const practices = await listPractices()
    return Response.json({ practices })
  })
}

export function POST(request: Request) {
  return route(async () => {
    requirePassword(request)
    const deck = await createPractice()
    return Response.json({ deck }, { status: 201 })
  })
}
