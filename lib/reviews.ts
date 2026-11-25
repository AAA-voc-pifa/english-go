import { ObjectId } from "mongodb"
import { recordScore } from "@/lib/activity"
import { ApiError } from "@/lib/api-error"
import { mnemonicsForWords } from "@/lib/mnemonics"
import { parseId } from "@/lib/practices"
import { sentencesByIds } from "@/lib/sentence-content"
import { completedAtFromAwards } from "@/lib/session-status"
import { collections, type ReviewDoc, type StarDoc } from "@/lib/store"
import {
  isAward,
  type AwardResponse,
  type Deck,
  type MnemonicData,
  type ReviewSummary,
} from "@/lib/types"
import { increaseWordPoints } from "@/lib/voc"

const REVIEW_SIZE = 9
const PICK_PAGE = 24

function toDeck(
  doc: ReviewDoc,
  content: Map<string, { word: string; en: string; zh: string }>,
  points: Map<string, number>,
  mnemonics: Map<string, MnemonicData>,
): Deck {
  const cards = doc.items.map((item) => {
    const key = item.sentenceId.toHexString()
    const sentence = content.get(key)
    if (!sentence) {
      throw new ApiError(`Missing sentence ${key} in review`, 500)
    }
    return {
      id: key,
      word: sentence.word,
      en: sentence.en,
      zh: sentence.zh,
      award: item.award,
      points: points.get(key) ?? 0,
      starred: true,
      mnemonic: mnemonics.get(sentence.word) ?? null,
    }
  })
  const last = Math.max(cards.length - 1, 0)
  return {
    id: doc._id.toHexString(),
    createdAt: doc.createdAt.toISOString(),
    cursor: Math.min(Math.max(doc.cursor, 0), last),
    cards,
    groups: cards.map((card) => ({
      key: card.id,
      label: card.word,
      points: card.points,
      cardIds: [card.id],
    })),
  }
}

async function requireReview(id: string): Promise<ReviewDoc> {
  const { reviews } = await collections()
  const doc = await reviews.findOne({ _id: parseId(id, "Review not found") })
  if (!doc) throw new ApiError("Review not found", 404)
  return doc
}

async function pruneUnstarred(doc: ReviewDoc): Promise<ReviewDoc> {
  if (doc.items.length === 0) return doc
  const { stars, reviews } = await collections()
  const ids = doc.items.map((item) => item.sentenceId)
  const found = await stars.findMany({ sentenceId: { $in: ids } })
  const alive = new Set(found.map((entry) => entry.sentenceId.toHexString()))
  if (alive.size === doc.items.length) return doc

  const items = doc.items.filter((item) => alive.has(item.sentenceId.toHexString()))
  const cursor = items.length === 0 ? 0 : Math.min(doc.cursor, items.length - 1)
  const completedAt = completedAtFromAwards(
    items.map((item) => item.award),
    doc.completedAt,
  )
  await reviews.updateOne({ _id: doc._id }, { $set: { items, cursor, completedAt } })
  const next = await reviews.findOne({ _id: doc._id })
  if (!next) throw new ApiError("Review not found", 404)
  return next
}

async function readDeck(doc: ReviewDoc): Promise<Deck> {
  const pruned = await pruneUnstarred(doc)
  const ids = pruned.items.map((item) => item.sentenceId)
  const [sentenceMap, starDocs] = await Promise.all([
    sentencesByIds(ids),
    ids.length === 0
      ? Promise.resolve([] as StarDoc[])
      : collections().then(({ stars }) => stars.findMany({ sentenceId: { $in: ids } })),
  ])
  const content = new Map(
    [...sentenceMap.entries()].map(([key, sentence]) => [
      key,
      { word: sentence.word, en: sentence.en, zh: sentence.zh },
    ]),
  )
  const points = new Map(starDocs.map((star) => [star.sentenceId.toHexString(), star.points]))
  const mnemonics = await mnemonicsForWords([...content.values()].map((sentence) => sentence.word))
  return toDeck(pruned, content, points, mnemonics)
}

function isOpenReview(doc: ReviewDoc): boolean {
  return doc.completedAt === null && doc.items.length > 0
}

async function findOpenReview(): Promise<ReviewDoc | null> {
  const { reviews } = await collections()
  const docs = await reviews.findMany({ completedAt: null }, { sort: { createdAt: -1 } })
  for (const doc of docs) {
    const pruned = await pruneUnstarred(doc)
    if (isOpenReview(pruned)) return pruned
  }
  return null
}

/** Page through lowest-point stars until REVIEW_SIZE unique words are picked. */
async function pickReviewStars(): Promise<StarDoc[]> {
  const { stars } = await collections()
  const picked: StarDoc[] = []
  const seenWords = new Set<string>()
  let skip = 0

  while (picked.length < REVIEW_SIZE) {
    const page = await stars.findMany(
      {},
      { sort: { points: 1, createdAt: 1, _id: 1 }, limit: PICK_PAGE, skip },
    )
    if (page.length === 0) break
    skip += page.length

    const sentenceMap = await sentencesByIds(page.map((star) => star.sentenceId))
    for (const star of page) {
      const sentence = sentenceMap.get(star.sentenceId.toHexString())
      if (!sentence || seenWords.has(sentence.word)) continue
      seenWords.add(sentence.word)
      picked.push(star)
      if (picked.length >= REVIEW_SIZE) break
    }
  }

  return picked
}

export async function createReview(): Promise<Deck> {
  const open = await findOpenReview()
  if (open) return readDeck(open)

  const { reviews } = await collections()
  const picked = await pickReviewStars()
  if (picked.length === 0) throw new ApiError("No starred sentences yet", 409)

  const doc: ReviewDoc = {
    _id: new ObjectId(),
    createdAt: new Date(),
    completedAt: null,
    cursor: 0,
    items: picked.map((star) => ({
      sentenceId: star.sentenceId,
      award: null,
    })),
  }
  await reviews.insertOne(doc)
  return readDeck(doc)
}

export async function listReviews(limit = 20): Promise<ReviewSummary[]> {
  const { reviews } = await collections()
  const docs = await reviews.findMany({}, { sort: { createdAt: -1 }, limit })
  const pruned = await Promise.all(docs.map(pruneUnstarred))
  return pruned.map((doc) => ({
    id: doc._id.toHexString(),
    createdAt: doc.createdAt.toISOString(),
    answered: doc.items.filter((item) => item.award !== null).length,
    total: doc.items.length,
  }))
}

export async function getReview(id: string): Promise<Deck> {
  return readDeck(await requireReview(id))
}

export async function setReviewCursor(id: string, cursor: number): Promise<Deck> {
  const doc = await requireReview(id)
  if (!Number.isInteger(cursor) || cursor < 0 || cursor >= doc.items.length) {
    throw new ApiError("That position is invalid", 400)
  }
  const { reviews } = await collections()
  await reviews.updateOne({ _id: doc._id }, { $set: { cursor } })
  return getReview(id)
}

function wordPointsFromSentenceAward(award: number): number {
  return Math.ceil((award * 2) / 3)
}

export async function awardReviewCard(
  id: string,
  sentenceId: string,
  award: number,
): Promise<AwardResponse> {
  if (!isAward(award)) throw new ApiError("Score must be 5, 10, or 15", 400)
  const doc = await requireReview(id)
  const objectId = parseId(sentenceId, "Sentence not found")
  const item = doc.items.find((entry) => entry.sentenceId.equals(objectId))
  if (!item) throw new ApiError("Sentence not found", 404)
  if (item.award !== null) throw new ApiError("Already scored", 409)

  const { reviews, stars, sentences } = await collections()
  const [star, sentence] = await Promise.all([
    stars.findOne({ sentenceId: objectId }),
    sentences.findOne({ _id: objectId }),
  ])
  if (!star || !sentence) throw new ApiError("Sentence not found", 404)

  const nextAwards = doc.items.map((entry) =>
    entry.sentenceId.equals(objectId) ? award : entry.award,
  )
  const completedAt = completedAtFromAwards(nextAwards, doc.completedAt)
  const nextStarPoints = star.points + award

  const wordDelta = wordPointsFromSentenceAward(award)
  await increaseWordPoints(sentence.word, wordDelta)
  try {
    await stars.updateOne({ _id: star._id }, { $inc: { points: award } })
  } catch (error) {
    await increaseWordPoints(sentence.word, -wordDelta).catch(() => undefined)
    throw error
  }

  const updated = await reviews.updateOne(
    { _id: doc._id },
    { $set: { "items.$[item].award": award, completedAt } },
    { arrayFilters: [{ "item.sentenceId": objectId, "item.award": null }] },
  )
  if (updated.modifiedCount !== 1) {
    await Promise.all([
      stars.updateOne({ _id: star._id }, { $inc: { points: -award } }).catch(() => undefined),
      increaseWordPoints(sentence.word, -wordDelta).catch(() => undefined),
    ])
    throw new ApiError("Already scored", 409)
  }

  await recordScore().catch((error: unknown) => {
    console.error("activity bump failed", error instanceof Error ? error.message : "error")
  })
  return {
    cardId: sentenceId,
    award,
    points: nextStarPoints,
    finished: completedAt !== null,
  }
}
