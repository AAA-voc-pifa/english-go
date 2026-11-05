import { timingSafeEqual } from "node:crypto"
import { ApiError } from "@/lib/api-error"
import { env } from "@/lib/env"

export function requirePassword(request: Request) {
  const given = Buffer.from(request.headers.get("password") ?? "")
  const expected = Buffer.from(env().appPassword)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new ApiError("口令不对", 401)
  }
}
