import { route } from "@/lib/api-error"
import { requirePassword } from "@/lib/auth"
import { createRound, listRounds } from "@/lib/rounds"

export const maxDuration = 120

export function GET() {
  return route(async () => {
    const rounds = await listRounds()
    return Response.json({ rounds })
  })
}

export function POST(request: Request) {
  return route(async () => {
    requirePassword(request)
    const round = await createRound()
    return Response.json({ round }, { status: 201 })
  })
}
