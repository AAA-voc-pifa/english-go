import { passwordHeaders } from "@/lib/client-auth"

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        ...passwordHeaders(),
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
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
