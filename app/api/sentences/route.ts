import { route } from "@/lib/api-error"
import { requirePassword } from "@/lib/auth"
import { readCursor, readLimit } from "@/lib/query"
import { listSentences, starPracticeLine } from "@/lib/sentences"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function GET(request: Request) {
  return route(async () => {
    requirePassword(request)
    const url = new URL(request.url)
    const { sentences, nextCursor } = await listSentences(readLimit(url), readCursor(url))
    return Response.json({ sentences, nextCursor })
  })
}

export function POST(request: Request) {
  return route(async () => {
    requirePassword(request)
    const body: unknown = await request.json().catch(() => null)
    if (!isRecord(body) || typeof body.lineId !== "string") {
      return Response.json({ error: "Missing sentence" }, { status: 400 })
    }
    const sentence = await starPracticeLine(body.lineId)
    return Response.json({ sentence }, { status: 201 })
  })
}
