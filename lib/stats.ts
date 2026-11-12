import { collections } from "@/lib/store"
import type { Award, StatsSnapshot } from "@/lib/types"
import { listAllWords } from "@/lib/voc"

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]
  return round1((sorted[mid - 1] + sorted[mid]) / 2)
}

function wordBuckets(points: number[]): Array<{ label: string; count: number }> {
  // 0 = untouched; 1–14 includes a single wide award (5/10) before a full deep floor (3×5).
  const labels = ["0", "1–14", "15–29", "30–49", "50–79", "80–119", "120+"]
  const counts = [0, 0, 0, 0, 0, 0, 0]
  for (const value of points) {
    if (value <= 0) counts[0] += 1
    else if (value < 15) counts[1] += 1
    else if (value < 30) counts[2] += 1
    else if (value < 50) counts[3] += 1
    else if (value < 80) counts[4] += 1
    else if (value < 120) counts[5] += 1
    else counts[6] += 1
  }
  return labels.map((label, index) => ({ label, count: counts[index] }))
}

function sentenceBuckets(points: number[]): Array<{ label: string; count: number }> {
  const labels = ["0", "1–14", "15–29", "30–49", "50–79", "80–119", "120+"]
  const counts = [0, 0, 0, 0, 0, 0, 0]
  for (const value of points) {
    if (value <= 0) counts[0] += 1
    else if (value < 15) counts[1] += 1
    else if (value < 30) counts[2] += 1
    else if (value < 50) counts[3] += 1
    else if (value < 80) counts[4] += 1
    else if (value < 120) counts[5] += 1
    else counts[6] += 1
  }
  return labels.map((label, index) => ({ label, count: counts[index] }))
}

export async function getStats(): Promise<StatsSnapshot> {
  const [{ practices, stars, reviews }, words] = await Promise.all([collections(), listAllWords()])

  const pointValues = words
    .slice()
    .sort((left, right) => left.points - right.points || left.word.localeCompare(right.word))
    .map((item) => item.points)
  const totalPoints = pointValues.reduce((sum, value) => sum + value, 0)

  const [practiceDocs, favourites, reviewDocs] = await Promise.all([
    practices.find({}, { projection: { lines: 1 } }).toArray(),
    stars.find({}, { projection: { points: 1 } }).toArray(),
    reviews.find({}, { projection: { items: 1 } }).toArray(),
  ])

  let completedPractices = 0
  let sentencesScored = 0
  let pointsEarned = 0
  for (const practice of practiceDocs) {
    const lines = practice.lines ?? []
    if (lines.length === 0) continue
    let answered = 0
    let gained = 0
    for (const line of lines) {
      if (line.award === null) continue
      answered += 1
      gained += line.award as Award
    }
    sentencesScored += answered
    pointsEarned += gained
    if (answered === lines.length) completedPractices += 1
  }

  let reviewCompleted = 0
  let reviewScored = 0
  for (const review of reviewDocs) {
    const answered = review.items.filter((item) => item.award !== null).length
    reviewScored += answered
    if (review.items.length > 0 && answered === review.items.length) reviewCompleted += 1
  }

  const favouritePoints = favourites.map((item) => item.points).slice().sort((left, right) => left - right)
  const favouriteTotal = favouritePoints.reduce((sum, value) => sum + value, 0)

  return {
    words: {
      total: words.length,
      average: words.length === 0 ? 0 : round1(totalPoints / words.length),
      median: median(pointValues),
      lowest: pointValues[0] ?? 0,
      highest: pointValues.at(-1) ?? 0,
      buckets: wordBuckets(pointValues),
    },
    practices: {
      total: practiceDocs.length,
      completed: completedPractices,
      sentencesScored,
      pointsEarned,
    },
    favourites: {
      total: favourites.length,
      average: favourites.length === 0 ? 0 : round1(favouriteTotal / favourites.length),
      unscored: favouritePoints.filter((value) => value === 0).length,
      lowest: favouritePoints[0] ?? 0,
      highest: favouritePoints.at(-1) ?? 0,
      buckets: sentenceBuckets(favouritePoints),
    },
    reviews: {
      total: reviewDocs.length,
      completed: reviewCompleted,
      sentencesScored: reviewScored,
    },
  }
}
