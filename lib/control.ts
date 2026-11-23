import { cn } from "@/lib/cn"

/** Shared chrome for KeyButton + header nav — press is a short dip, not a color invert. */
export function controlBase(className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 border text-sm select-none touch-manipulation",
    "transition-[transform,background-color,border-color,filter] duration-100 ease-out",
    "active:scale-[0.97] active:brightness-90",
    className,
  )
}

export function controlPress(flash: boolean) {
  return flash ? "scale-[0.97] brightness-90" : undefined
}
