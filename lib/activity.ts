import { activitySchema, type ActivityDoc } from "@/lib/db-schema"
import { getDb } from "@/lib/mongo"
import { validatedCollection } from "@/lib/validated-collection"

/** Personal app timezone for day boundaries on the heatmap. */
const TIME_ZONE = "Asia/Shanghai"

const DAY_MS = 24 * 60 * 60 * 1000

function dayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

/** Instant for local midnight of `YYYY-MM-DD` in TIME_ZONE (as a UTC Date). */
function atLocalMidnight(day: string): Date {
  return new Date(`${day}T00:00:00+08:00`)
}

function addDays(day: string, delta: number): string {
  return dayKey(new Date(atLocalMidnight(day).getTime() + delta * DAY_MS))
}

function weekdaySun0(day: string): number {
  // 0 = Sunday … 6 = Saturday in Asia/Shanghai
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
  }).formatToParts(atLocalMidnight(day))
  const weekday = parts.find((part) => part.type === "weekday")?.value
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return map[weekday ?? "Sun"] ?? 0
}

async function activity() {
  const db = await getDb()
  return validatedCollection(db.collection<ActivityDoc>("activity"), activitySchema, "activity")
}

/** +1 when the user scores a practice/review card. */
export async function recordScore(): Promise<void> {
  const day = dayKey(new Date())
  await (await activity()).updateOne({ _id: day }, { $inc: { count: 1 } }, { upsert: true })
}

export type ActivityDay = {
  date: string
  count: number
}

/**
 * Contiguous day series for a GitHub-style heatmap: starts on a Sunday
 * `weeks` columns back, ends today (Asia/Shanghai).
 */
export async function listActivityHeatmap(weeks = 53): Promise<{
  days: ActivityDay[]
  total: number
}> {
  const today = dayKey(new Date())
  const todayDow = weekdaySun0(today)
  const end = today
  const start = addDays(today, -(weeks - 1) * 7 - todayDow)

  const docs = await (await activity()).findMany({
    _id: { $gte: start, $lte: end },
  })
  const byDay = new Map(docs.map((doc) => [doc._id, doc.count]))

  const days: ActivityDay[] = []
  let cursor = start
  let total = 0
  while (cursor <= end) {
    const count = byDay.get(cursor) ?? 0
    days.push({ date: cursor, count })
    total += count
    cursor = addDays(cursor, 1)
  }

  return { days, total }
}
