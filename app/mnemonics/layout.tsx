import type { Metadata } from "next"
import type { ReactNode } from "react"

export const metadata: Metadata = {
  title: {
    absolute: "English Go Mnemonic",
  },
}

export default function MnemonicsLayout({ children }: { children: ReactNode }) {
  return children
}
