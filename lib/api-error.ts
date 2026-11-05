export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

export function asApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (error instanceof Error && error.name === "TimeoutError") {
    return new ApiError("上游接口超时了", 504)
  }
  if (error instanceof Error) return new ApiError(error.message, 500)
  return new ApiError("出错了", 500)
}

export function jsonError(error: unknown): Response {
  const normalized = asApiError(error)
  if (normalized.status >= 500) console.error(normalized.message)
  return Response.json({ error: normalized.message }, { status: normalized.status })
}

export function route(handler: () => Promise<Response>): Promise<Response> {
  return handler().catch((error: unknown) => jsonError(error))
}
