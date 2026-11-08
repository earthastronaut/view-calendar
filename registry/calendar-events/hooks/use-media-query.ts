import { useSyncExternalStore } from "react"

/**
 * Whether `query` currently matches. Subscribes to `matchMedia` changes without an effect
 * that sets state. Server render and environments without `matchMedia` report `false`.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {}
      const list = window.matchMedia(query)
      list.addEventListener("change", onChange)
      return () => list.removeEventListener("change", onChange)
    },
    () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(query).matches,
    () => false,
  )
}
