import { collections } from "@/lib/store"
import type { Award, StatsSnapshot, WordStat } from "@/lib/types"
import { listAllWords } from "@/lib/voc"

const LIST_SIZE = 8

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]
  return round1((sorted[mid - 1] + sorted[mid]) / 2)
}

function bucketsFor(points: number[]): Array<{ label: string; count: number }> {
  const labels = ["0–14", "15–29", "30–49", "50–79", "80–119", "120+"]
  const counts = [0, 0, 0, 0, 0, 0]
  for (const value of points) {
    if (value < 15) counts[0] += 1
    else if (value < 30) counts[1] += 1
    else if (value < 50) counts[2] += 1
    else if (value < 80) counts[3] += 1
    else if (value < 120) counts[4] += 1
    else counts[5] += 1
  }
  return labels.map((label, index) => ({ label, count: counts[index] }))
}

function toWordStat(word: string, points: number, updatedAt?: string): WordStat {
  return updatedAt ? { word, points, updatedAt } : { word, points }
}

export async function getStats(): Promise<StatsSnapshot> {
  const [{ practices, practiceLines, sentences, reviews }, words] = await Promise.all([
    collections(),
    listAllWords(),
  ])

  const sortedByPoints = words
    .slice()
    .sort((left, right) => left.points - right.points || left.word.localeCompare(right.word))
  const pointValues = sortedByPoints.map((item) => item.points)
  const totalPoints = pointValues.reduce((sum, value) => sum + value, 0)
  const recent = words
    .slice()
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.word.localeCompare(right.word))
    .slice(0, LIST_SIZE)
    .map((item) => toWordStat(item.word, item.points, item.updatedAt))

  const [practiceDocs, lineDocs, favourites, reviewDocs] = await Promise.all([
    practices.find({}, { projection: { _id: 1 } }).toArray(),
    practiceLines.find({}, { projection: { practiceId: 1, award: 1 } }).toArray(),
    sentences.find({}, { sort: { points: 1, createdAt: 1 } }).toArray(),
    reviews.find({}, { projection: { items: 1 } }).toArray(),
  ])

  const byPractice = new Map<string, { total: number; answered: number; gained: number }>()
  for (const line of lineDocs) {
    const key = line.practiceId.toHexString()
    const current = byPractice.get(key) ?? { total: 0, answered: 0, gained: 0 }
    current.total += 1
    if (line.award !== null) {
      current.answered += 1
      current.gained += line.award as Award
    }
    byPractice.set(key, current)
  }

  let completedPractices = 0
  let sentencesScored = 0
  let pointsEarned = 0
  for (const practice of practiceDocs) {
    const stat = byPractice.get(practice._id.toHexString())
    if (!stat) continue
    sentencesScored += stat.answered
    pointsEarned += stat.gained
    if (stat.total > 0 && stat.answered === stat.total) completedPractices += 1
  }

  let reviewCompleted = 0
  let reviewScored = 0
  for (const review of reviewDocs) {
    const answered = review.items.filter((item) => item.award !== null).length
    reviewScored += answered
    if (review.items.length > 0 && answered === review.items.length) reviewCompleted += 1
  }

  const favouritePoints = favourites.map((item) => item.points)
  const favouriteTotal = favouritePoints.reduce((sum, value) => sum + value, 0)

  const weakestDocs = sortedByPoints.slice(0, LIST_SIZE)
  const weakestWords = new Set(weakestDocs.map((item) => item.word))
  const strongestDocs = sortedByPoints
    .slice()
    .reverse()
    .filter((item) => !weakestWords.has(item.word))
    .slice(0, LIST_SIZE)

  return {
    words: {
      total: words.length,
      average: words.length === 0 ? 0 : round1(totalPoints / words.length),
      median: median(pointValues),
      lowest: pointValues[0] ?? 0,
      highest: pointValues.at(-1) ?? 0,
      buckets: bucketsFor(pointValues),
      weakest: weakestDocs.map((item) => toWordStat(item.word, item.points)),
      strongest: strongestDocs.map((item) => toWordStat(item.word, item.points)),
      recent,
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
      weakest: favourites.slice(0, LIST_SIZE).map((item) => ({
        id: item._id.toHexString(),
        word: item.word,
        en: item.en,
        points: item.points,
      })),
    },
    reviews: {
      total: reviewDocs.length,
      completed: reviewCompleted,
      sentencesScored: reviewScored,
    },
  }
}
