import { route } from "@/lib/api-error"
import { requirePassword } from "@/lib/auth"
import { createPractice, listOpenPracticeIds, listPractices } from "@/lib/practices"
import { readCursor, readLimit } from "@/lib/query"

export const maxDuration = 120

export function GET(request: Request) {
  return route(async () => {
    requirePassword(request)
    const url = new URL(request.url)
    if (url.searchParams.get("open") === "1") {
      const openIds = await listOpenPracticeIds()
      return Response.json({ openIds })
    }
    const { practices, nextCursor } = await listPractices(readLimit(url), readCursor(url))
    return Response.json({ practices, nextCursor })
  })
}

export function POST(request: Request) {
  return route(async () => {
    requirePassword(request)
    const deck = await createPractice()
    return Response.json({ deck }, { status: 201 })
  })
}
