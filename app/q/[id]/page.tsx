import { redirect } from "next/navigation"

export default async function LegacyQuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/practice/${id}`)
}
