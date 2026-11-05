import { route } from "@/lib/api-error"
import { requirePassword } from "@/lib/auth"
import { createQuiz, listQuizzes } from "@/lib/quizzes"

export const maxDuration = 120

export function GET() {
  return route(async () => {
    const quizzes = await listQuizzes()
    return Response.json({ quizzes })
  })
}

export function POST(request: Request) {
  return route(async () => {
    requirePassword(request)
    const quiz = await createQuiz()
    return Response.json({ quiz }, { status: 201 })
  })
}
