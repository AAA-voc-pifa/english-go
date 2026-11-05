import { route } from "@/lib/api-error"
import { requirePassword } from "@/lib/auth"
import { awardQuestion, getQuiz, setCursor, setRevealed } from "@/lib/quizzes"

type Context = { params: Promise<{ id: string }> }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function GET(_request: Request, context: Context) {
  return route(async () => {
    const { id } = await context.params
    const quiz = await getQuiz(id)
    return Response.json({ quiz })
  })
}

export function PATCH(request: Request, context: Context) {
  return route(async () => {
    const { id } = await context.params
    const body: unknown = await request.json().catch(() => null)
    if (!isRecord(body)) {
      return Response.json({ error: "请求格式不对" }, { status: 400 })
    }

    if (typeof body.cursor === "number") {
      return Response.json({ quiz: await setCursor(id, body.cursor) })
    }

    if (typeof body.questionId !== "string") {
      return Response.json({ error: "缺少题目" }, { status: 400 })
    }

    if (typeof body.revealed === "boolean") {
      return Response.json({ quiz: await setRevealed(id, body.questionId, body.revealed) })
    }

    if (typeof body.award === "number") {
      requirePassword(request)
      return Response.json({ quiz: await awardQuestion(id, body.questionId, body.award) })
    }

    return Response.json({ error: "没有要更新的内容" }, { status: 400 })
  })
}
