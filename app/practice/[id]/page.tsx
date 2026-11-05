import { Suspense } from "react"
import { PracticeSession } from "@/components/practice-session"
import { StatusBlock } from "@/components/status-block"

export default function PracticePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<StatusBlock>正在读取练习…</StatusBlock>}>
      <PracticeRoute params={params} />
    </Suspense>
  )
}

async function PracticeRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <PracticeSession key={id} id={id} />
}
