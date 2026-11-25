import { route } from "@/lib/api-error"
import { requirePassword } from "@/lib/auth"
import { deleteMnemonic, getMnemonic, updateMnemonic } from "@/lib/mnemonics"
import { isRecord } from "@/lib/is-record"

type Context = { params: Promise<{ word: string }> }

export function GET(request: Request, context: Context) {
  return route(async () => {
    requirePassword(request)
    const { word } = await context.params
    const mnemonic = await getMnemonic(decodeURIComponent(word))
    return Response.json({ mnemonic })
  })
}

export function PATCH(request: Request, context: Context) {
  return route(async () => {
    requirePassword(request)
    const { word } = await context.params
    const body: unknown = await request.json().catch(() => null)
    if (!isRecord(body) || !("data" in body)) {
      return Response.json({ error: "Missing mnemonic data" }, { status: 400 })
    }
    const mnemonic = await updateMnemonic(decodeURIComponent(word), body.data)
    return Response.json({ mnemonic })
  })
}

export function DELETE(request: Request, context: Context) {
  return route(async () => {
    requirePassword(request)
    const { word } = await context.params
    await deleteMnemonic(decodeURIComponent(word))
    return Response.json({ ok: true })
  })
}
