const PASSWORD_KEY = "english-go.password"
const PASSWORD_EVENT = "english-go-password-change"

export function readPassword(): string {
  if (typeof window === "undefined") return ""
  return window.localStorage.getItem(PASSWORD_KEY) ?? ""
}

function notifyPassword() {
  window.dispatchEvent(new Event(PASSWORD_EVENT))
}

export function writePassword(password: string) {
  window.localStorage.setItem(PASSWORD_KEY, password)
  notifyPassword()
}

export function clearPassword() {
  window.localStorage.removeItem(PASSWORD_KEY)
  notifyPassword()
}

export function subscribePassword(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange)
  window.addEventListener(PASSWORD_EVENT, onStoreChange)
  return () => {
    window.removeEventListener("storage", onStoreChange)
    window.removeEventListener(PASSWORD_EVENT, onStoreChange)
  }
}

export function passwordHeaders(password = readPassword()): Record<string, string> {
  return password ? { password } : {}
}
