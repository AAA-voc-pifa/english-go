import { route } from "@/lib/api-error"
import { requirePassword } from "@/lib/auth"

export function POST(request: Request) {
  return route(async () => {
    requirePassword(request)
    return Response.json({ ok: true })
  })
}
