export function readLimit(url: URL, fallback = 20): number {
  const raw = Number(url.searchParams.get("limit") ?? fallback)
  if (!Number.isFinite(raw)) return fallback
  return Math.min(Math.max(Math.trunc(raw), 1), 50)
}

export function readCursor(url: URL): string | undefined {
  const cursor = url.searchParams.get("cursor")
  return cursor && cursor.length > 0 ? cursor : undefined
}
