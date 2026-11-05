export function StatusBlock({
  tone = "muted",
  children,
}: {
  tone?: "muted" | "hot"
  children: React.ReactNode
}) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 py-10">
      <p role={tone === "hot" ? "alert" : "status"} className={tone === "hot" ? "text-hot" : "text-muted"}>
        {children}
      </p>
    </main>
  )
}
