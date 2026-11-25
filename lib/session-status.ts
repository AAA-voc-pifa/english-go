/** Derive `completedAt` from award slots. Empty sessions count as finished. */
export function completedAtFromAwards(
  awards: ReadonlyArray<unknown>,
  previous: Date | null,
  now = new Date(),
): Date | null {
  if (awards.length === 0) return previous ?? now
  if (awards.some((award) => award === null)) return null
  return previous ?? now
}
