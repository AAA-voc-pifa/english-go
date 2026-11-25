async function settle(check: () => Promise<void>, attempts = 8, gapMs = 500): Promise<void> {
  let last: unknown
  for (let i = 0; i < attempts; i += 1) {
    try {
      await check()
      return
    } catch (error) {
      last = error
      if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, gapMs))
    }
  }
  throw last instanceof Error ? last : new Error("Service check failed")
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  const { verifyTtsPassword } = await import("@/lib/tts")
  const { verifyVoc } = await import("@/lib/voc")

  const checks = await Promise.allSettled([
    settle(() => verifyVoc()),
    settle(() => verifyTtsPassword()),
  ])
  const failures = checks.flatMap((result) => (result.status === "rejected" ? [result.reason] : []))
  if (failures.length === 0) return

  const detail = failures
    .map((reason) => (reason instanceof Error ? reason.message : "Service check failed"))
    .join(" ")
  throw new Error(`Startup failed. ${detail}`)
}
