import { listActivityHeatmap } from "@/lib/activity"
import { collections } from "@/lib/store"
import type { StatsSnapshot } from "@/lib/types"
import { listAllWords } from "@/lib/voc"

/** my-voc sentinel for graduated / parked words — exclude from score spread. */
const VOC_SENTINEL = 99999

const POINT_BUCKETS = [
  { label: "0", min: 0, max: 0 },
  { label: "1–14", min: 1, max: 14 },
  { label: "15–29", min: 15, max: 29 },
  { label: "30–49", min: 30, max: 49 },
  { label: "50–79", min: 50, max: 79 },
  { label: "80–119", min: 80, max: 119 },
  { label: "120+", min: 120, max: Number.POSITIVE_INFINITY },
] as const

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]
  return round1((sorted[mid - 1] + sorted[mid]) / 2)
}

function scoreBuckets(points: number[]): Array<{ label: string; count: number }> {
  const counts = POINT_BUCKETS.map(() => 0)
  for (const value of points) {
    const index = POINT_BUCKETS.findIndex((bucket) => value >= bucket.min && value <= bucket.max)
    counts[index === -1 ? counts.length - 1 : index] += 1
  }
  return POINT_BUCKETS.map((bucket, index) => ({ label: bucket.label, count: counts[index] }))
}

type PracticeAgg = {
  total: number
  completed: number
  sentencesScored: number
  pointsEarned: number
}

type ReviewAgg = {
  total: number
  completed: number
  sentencesScored: number
}

async function aggregatePractices(): Promise<PracticeAgg> {
  const { practices } = await collections()
  const rows = await practices.raw
    .aggregate<{
      total: number
      completed: number
      sentencesScored: number
      pointsEarned: number
    }>([
      {
        $project: {
          completed: { $cond: [{ $ne: ["$completedAt", null] }, 1, 0] },
          answered: {
            $size: {
              $filter: {
                input: "$lines",
                as: "line",
                cond: { $ne: ["$$line.award", null] },
              },
            },
          },
          gained: {
            $sum: {
              $map: {
                input: "$lines",
                as: "line",
                in: { $ifNull: ["$$line.award", 0] },
              },
            },
          },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: { $sum: "$completed" },
          sentencesScored: { $sum: "$answered" },
          pointsEarned: { $sum: "$gained" },
        },
      },
    ])
    .toArray()

  const row = rows[0]
  return {
    total: row?.total ?? 0,
    completed: row?.completed ?? 0,
    sentencesScored: row?.sentencesScored ?? 0,
    pointsEarned: row?.pointsEarned ?? 0,
  }
}

async function aggregateReviews(): Promise<ReviewAgg> {
  const { reviews } = await collections()
  const rows = await reviews.raw
    .aggregate<{
      total: number
      completed: number
      sentencesScored: number
    }>([
      {
        $project: {
          completed: { $cond: [{ $ne: ["$completedAt", null] }, 1, 0] },
          answered: {
            $size: {
              $filter: {
                input: "$items",
                as: "item",
                cond: { $ne: ["$$item.award", null] },
              },
            },
          },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: { $sum: "$completed" },
          sentencesScored: { $sum: "$answered" },
        },
      },
    ])
    .toArray()

  const row = rows[0]
  return {
    total: row?.total ?? 0,
    completed: row?.completed ?? 0,
    sentencesScored: row?.sentencesScored ?? 0,
  }
}

export async function getStats(): Promise<StatsSnapshot> {
  const [{ stars }, words, activity, practiceAgg, reviewAgg] = await Promise.all([
    collections(),
    listAllWords(),
    listActivityHeatmap(53),
    aggregatePractices(),
    aggregateReviews(),
  ])

  const activeWords = words.filter((item) => item.points < VOC_SENTINEL)
  const pointValues = activeWords
    .slice()
    .sort((left, right) => left.points - right.points || left.word.localeCompare(right.word))
    .map((item) => item.points)
  const totalPoints = pointValues.reduce((sum, value) => sum + value, 0)

  // Favourites stay as a full read: median/buckets need the point list; count stays small.
  const favourites = await stars.findMany({})
  const favouritePoints = favourites
    .map((item) => item.points)
    .slice()
    .sort((left, right) => left - right)
  const favouriteTotal = favouritePoints.reduce((sum, value) => sum + value, 0)

  return {
    words: {
      total: words.length,
      average: pointValues.length === 0 ? 0 : round1(totalPoints / pointValues.length),
      median: median(pointValues),
      lowest: pointValues[0] ?? 0,
      highest: pointValues.at(-1) ?? 0,
      buckets: scoreBuckets(pointValues),
    },
    practices: practiceAgg,
    favourites: {
      total: favourites.length,
      average: favourites.length === 0 ? 0 : round1(favouriteTotal / favourites.length),
      unscored: favouritePoints.filter((value) => value === 0).length,
      lowest: favouritePoints[0] ?? 0,
      highest: favouritePoints.at(-1) ?? 0,
      buckets: scoreBuckets(favouritePoints),
    },
    reviews: reviewAgg,
    activity,
  }
}
