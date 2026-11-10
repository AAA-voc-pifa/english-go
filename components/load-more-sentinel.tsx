"use client"

import { useEffect, useRef } from "react"

export function LoadMoreSentinel({
  hasMore,
  loading,
  onVisible,
}: {
  hasMore: boolean
  loading: boolean
  onVisible: () => void
}) {
  const nodeRef = useRef<HTMLDivElement>(null)
  const onVisibleRef = useRef(onVisible)
  onVisibleRef.current = onVisible

  useEffect(() => {
    if (!hasMore || loading) return
    const node = nodeRef.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onVisibleRef.current()
      },
      { rootMargin: "320px 0px" },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, loading])

  if (!hasMore && !loading) return null
  return (
    <div ref={nodeRef} role="status" className="py-4 text-center text-sm text-muted">
      {loading ? "Loading…" : null}
    </div>
  )
}
