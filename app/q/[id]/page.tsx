import { Suspense } from "react"
import { redirect } from "next/navigation"
import { StatusBlock } from "@/components/status-block"

export default function LegacyQuizPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<StatusBlock>Loading…</StatusBlock>}>
      <LegacyRedirect params={params} />
    </Suspense>
  )
}

async function LegacyRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/practice/${id}`)
  return null
}
