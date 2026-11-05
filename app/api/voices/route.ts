import { route } from "@/lib/api-error"
import { requirePassword } from "@/lib/auth"
import { listVoices } from "@/lib/tts"

export function GET(request: Request) {
  return route(async () => {
    requirePassword(request)
    const voices = await listVoices()
    return Response.json({ voices })
  })
}
