import { route } from "@/lib/api-error"
import { requirePassword } from "@/lib/auth"
import { deleteSentence } from "@/lib/sentences"

type Context = { params: Promise<{ id: string }> }

export function DELETE(request: Request, context: Context) {
  return route(async () => {
    requirePassword(request)
    const { id } = await context.params
    await deleteSentence(id)
    return Response.json({ ok: true })
  })
}
