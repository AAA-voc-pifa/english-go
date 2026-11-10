import { passwordHeaders, readPassword } from "@/lib/client-auth"

function headerPassword(headers: HeadersInit | undefined): string {
  if (!headers) return ""
  if (headers instanceof Headers) return headers.get("password") ?? ""
  if (Array.isArray(headers)) {
    const hit = headers.find(([key]) => key.toLowerCase() === "password")
    return hit?.[1] ?? ""
  }
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "password" && typeof value === "string") return value
  }
  return ""
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = {
    ...passwordHeaders(),
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
    ...init?.headers,
  }
  const password = headerPassword(headers) || readPassword()
  if (typeof window !== "undefined" && !password) {
    throw new Error("Wrong password")
  }

  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      headers,
    })
  } catch {
    throw new Error("The network dropped")
  }

  const payload = (await response.json().catch(() => null)) as { error?: unknown } | null
  if (!response.ok) {
    const message =
      payload && typeof payload.error === "string" ? payload.error : `Request failed (${response.status})`
    throw new Error(message)
  }
  return payload as T
}
