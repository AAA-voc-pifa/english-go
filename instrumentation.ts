export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  const { verifyTtsPassword } = await import("@/lib/tts")
  const { verifyVocPassword } = await import("@/lib/voc")

  const checks = await Promise.allSettled([verifyVocPassword(), verifyTtsPassword()])
  const failures = checks.flatMap((result) => (result.status === "rejected" ? [result.reason] : []))
  if (failures.length === 0) return

  const detail = failures
    .map((reason) => (reason instanceof Error ? reason.message : "Password check failed"))
    .join(" ")
  throw new Error(`Startup failed. ${detail}`)
}
