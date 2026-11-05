import { Suspense } from "react"
import { QuizPlayer } from "@/components/quiz-player"

export default function QuizPage({ params }: PageProps<"/q/[id]">) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 py-8">
          <p role="status" className="text-muted">
            正在读取练习…
          </p>
        </main>
      }
    >
      <QuizRoute params={params} />
    </Suspense>
  )
}

async function QuizRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <QuizPlayer key={id} id={id} />
}
