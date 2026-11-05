import { Suspense } from "react"
import { DeckSession } from "@/components/deck-session"
import { StatusBlock } from "@/components/status-block"

export default function PracticePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<StatusBlock>Loading…</StatusBlock>}>
      <PracticeRoute params={params} />
    </Suspense>
  )
}

async function PracticeRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <DeckSession key={id} id={id} kind="practice" />
}
