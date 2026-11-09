import { route } from "@/lib/api-error"
import { requirePassword } from "@/lib/auth"
import { getStats } from "@/lib/stats"

export const maxDuration = 60

export function GET(request: Request) {
  return route(async () => {
    requirePassword(request)
    return Response.json({ stats: await getStats() })
  })
}
