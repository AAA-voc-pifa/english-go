export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  const { verifyTtsPassword } = await import("@/lib/tts")
  const { verifyVoc } = await import("@/lib/voc")

  const checks = await Promise.allSettled([verifyVoc(), verifyTtsPassword()])
  const failures = checks.flatMap((result) => (result.status === "rejected" ? [result.reason] : []))
  if (failures.length === 0) return

  const detail = failures
    .map((reason) => (reason instanceof Error ? reason.message : "Service check failed"))
    .join(" ")
  throw new Error(`Startup failed. ${detail}`)
}
