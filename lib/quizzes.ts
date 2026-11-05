import { ObjectId, type Collection, type Filter, type UpdateFilter } from "mongodb"
import { ApiError } from "@/lib/api-error"
import { generateTranslations } from "@/lib/question-api"
import { getDb } from "@/lib/mongo"
import { isAward, type Award, type Quiz, type QuizQuestion, type QuizSummary, type QuizWord } from "@/lib/types"
import { increaseWordPoints, listLowest } from "@/lib/voc"

type QuizDoc = {
  _id: ObjectId
  createdAt: Date
  words: QuizWord[]
  questions: QuizQuestion[]
  cursor: number
}

let indexReady: Promise<void> | null = null

async function collection(): Promise<Collection<QuizDoc>> {
  const db = await getDb()
  const quizzes = db.collection<QuizDoc>("quizzes")
  indexReady ??= quizzes
    .createIndex({ createdAt: -1 }, { name: "createdAt_desc" })
    .then(() => undefined)
    .catch((error: unknown) => {
      indexReady = null
      throw error
    })
  await indexReady
  return quizzes
}

function toQuiz(doc: QuizDoc): Quiz {
  const last = Math.max(doc.questions.length - 1, 0)
  return {
    id: doc._id.toHexString(),
    createdAt: doc.createdAt.toISOString(),
    words: doc.words,
    questions: doc.questions,
    cursor: Math.min(Math.max(doc.cursor, 0), last),
  }
}

function toSummary(doc: QuizDoc): QuizSummary {
  const answered = doc.questions.filter((question) => question.award !== null).length
  const gained = doc.questions.reduce((sum, question) => sum + (question.award ?? 0), 0)
  return {
    id: doc._id.toHexString(),
    createdAt: doc.createdAt.toISOString(),
    words: doc.words,
    answered,
    total: doc.questions.length,
    gained,
  }
}

function shuffle<T>(items: T[]): T[] {
  const next = items.slice()
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1))
    const current = next[index]
    next[index] = next[swap]
    next[swap] = current
  }
  return next
}

function parseQuizId(id: string): ObjectId {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new ApiError("练习不存在", 404)
  return new ObjectId(id)
}

async function requireQuiz(id: string): Promise<QuizDoc> {
  const doc = await (await collection()).findOne({ _id: parseQuizId(id) } satisfies Filter<QuizDoc>)
  if (!doc) throw new ApiError("练习不存在", 404)
  return doc
}

export async function createQuiz(): Promise<Quiz> {
  const lowest = await listLowest(3, 0)
  if (lowest.length === 0) throw new ApiError("词表是空的，先去 my-voc 加单词", 409)

  const groups = await Promise.all(
    lowest.map(async (item) => ({
      word: item,
      questions: await generateTranslations(item.word),
    })),
  )

  const doc: QuizDoc = {
    _id: new ObjectId(),
    createdAt: new Date(),
    words: lowest.map((item) => ({ word: item.word, points: item.points })),
    questions: shuffle(
      groups.flatMap(({ word, questions }) =>
        questions.map((question) => ({
          id: crypto.randomUUID(),
          word: word.word,
          en: question.en,
          zh: question.zh,
          revealed: false,
          award: null,
        })),
      ),
    ),
    cursor: 0,
  }

  await (await collection()).insertOne(doc)
  return toQuiz(doc)
}

export async function listQuizzes(limit = 50): Promise<QuizSummary[]> {
  const docs = await (await collection())
    .find({}, { sort: { createdAt: -1 }, limit })
    .toArray()
  return docs.map(toSummary)
}

export async function getQuiz(id: string): Promise<Quiz> {
  return toQuiz(await requireQuiz(id))
}

export async function quizHasSentence(text: string): Promise<boolean> {
  const doc = await (await collection()).findOne({ "questions.en": text }, { projection: { _id: 1 } })
  return doc !== null
}

export async function setCursor(id: string, cursor: number): Promise<Quiz> {
  const doc = await requireQuiz(id)
  if (!Number.isInteger(cursor) || cursor < 0 || cursor >= doc.questions.length) {
    throw new ApiError("题目位置不对", 400)
  }
  doc.cursor = cursor
  await (await collection()).updateOne({ _id: doc._id }, { $set: { cursor } })
  return toQuiz(doc)
}

export async function setRevealed(id: string, questionId: string, revealed: boolean): Promise<Quiz> {
  const doc = await requireQuiz(id)
  const index = doc.questions.findIndex((question) => question.id === questionId)
  if (index < 0) throw new ApiError("题目不存在", 404)
  doc.questions[index].revealed = revealed
  const update: UpdateFilter<QuizDoc> = {
    $set: { [`questions.${index}.revealed`]: revealed } as UpdateFilter<QuizDoc>["$set"],
  }
  await (await collection()).updateOne({ _id: doc._id }, update)
  return toQuiz(doc)
}

export async function awardQuestion(id: string, questionId: string, award: number): Promise<Quiz> {
  if (!isAward(award)) throw new ApiError("分数只能是 5、10 或 15", 400)
  const doc = await requireQuiz(id)
  const index = doc.questions.findIndex((question) => question.id === questionId)
  if (index < 0) throw new ApiError("题目不存在", 404)

  const question = doc.questions[index]
  if (question.award !== null) throw new ApiError("这题已经打过分了", 409)
  question.award = award

  const update: Record<string, Award | number> = {
    [`questions.${index}.award`]: award,
  }

  const nextPoints = await increaseWordPoints(question.word, award)
  const wordIndex = doc.words.findIndex((item) => item.word === question.word)
  if (wordIndex >= 0) {
    doc.words[wordIndex].points = nextPoints
    update[`words.${wordIndex}.points`] = nextPoints
  }

  try {
    await (await collection()).updateOne(
      { _id: doc._id },
      { $set: update as UpdateFilter<QuizDoc>["$set"] },
    )
  } catch (error) {
    await increaseWordPoints(question.word, -award).catch(() => undefined)
    throw error
  }
  return toQuiz(doc)
}
