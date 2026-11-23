import { Suspense } from "react"
import { MnemonicEditor } from "@/components/mnemonic-editor"
import { StatusBlock } from "@/components/status-block"

export default function MnemonicDetailPage({ params }: { params: Promise<{ word: string }> }) {
  return (
    <Suspense fallback={<StatusBlock>Loading…</StatusBlock>}>
      <MnemonicRoute params={params} />
    </Suspense>
  )
}

async function MnemonicRoute({ params }: { params: Promise<{ word: string }> }) {
  const { word } = await params
  const decoded = decodeURIComponent(word)
  return <MnemonicEditor key={decoded} word={decoded} />
}
