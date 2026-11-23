"use client"

import { useCallback, useEffect, useRef, useState } from "react"

const PRESS_MS = 140

/** Brief pressed look for mouse/touch and keyboard shortcuts. */
export function usePressFlash() {
  const [flash, setFlash] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
  }, [])

  const bump = useCallback(() => {
    setFlash(true)
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setFlash(false)
      timer.current = null
    }, PRESS_MS)
  }, [])

  return { flash, bump }
}
