"use client"

import { createContext, useCallback, useContext, useEffect, useRef } from "react"

type Handler = () => void

const ShortcutContext = createContext<((key: string, handler: Handler) => () => void) | null>(null)

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"
}

export function ShortcutProvider({ children }: { children: React.ReactNode }) {
  const handlers = useRef(new Map<string, Handler>())

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
      if (event.repeat || event.isComposing || event.key === "Process") return
      if (document.querySelector("[data-password-lock], [role='dialog']")) return
      if (isTyping(event.target)) return
      if (event.key.length !== 1) return
      const handler = handlers.current.get(event.key.toLowerCase())
      if (!handler) return
      event.preventDefault()
      handler()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const register = useCallback((key: string, handler: Handler) => {
    const name = key.toLowerCase()
    handlers.current.set(name, handler)
    return () => {
      if (handlers.current.get(name) === handler) handlers.current.delete(name)
    }
  }, [])

  return <ShortcutContext.Provider value={register}>{children}</ShortcutContext.Provider>
}

export function useShortcut(key: string, handler: Handler, enabled = true) {
  const register = useContext(ShortcutContext)
  const handlerRef = useRef(handler)

  useEffect(() => {
    handlerRef.current = handler
  }, [handler])

  useEffect(() => {
    if (!enabled || !register) return
    return register(key, () => handlerRef.current())
  }, [enabled, key, register])
}
