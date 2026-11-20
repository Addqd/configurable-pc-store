import { useEffect, useRef, useState } from 'react'

/**
 * Tracks the content width of an element with `ResizeObserver`.
 *
 * Charts need the real pixel width of their container to keep the approved
 * geometry: axis text must stay readable, so it may not be squeezed by an
 * arbitrary viewBox. `fallback` is used before the first measurement and in
 * environments without `ResizeObserver` (jsdom, older browsers).
 */
export function useElementWidth(fallback: number) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(fallback)

  useEffect(() => {
    const element = ref.current
    const Observer = element?.ownerDocument.defaultView?.ResizeObserver
    if (!element || !Observer) return
    const observer = new Observer((entries) => {
      const measured = Math.round(entries[0]?.contentRect.width ?? 0)
      if (measured > 0) setWidth(measured)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return [ref, width] as const
}

/**
 * Conservative width estimate for SVG axis text, which has no measured layout
 * available to the component. `0.55em` is slightly wider than the average
 * advance of the project's sans-serif stack, so estimates never run short.
 */
export function estimateTextWidth(text: string, fontSize: number): number {
  return Math.ceil(text.length * fontSize * 0.55)
}

/** Truncates `text` with an ellipsis so it fits into `maxWidth` pixels. */
export function truncateText(text: string, maxWidth: number, fontSize: number): string {
  if (estimateTextWidth(text, fontSize) <= maxWidth) return text
  const maxCharacters = Math.max(1, Math.floor(maxWidth / (fontSize * 0.55)) - 1)
  return `${text.slice(0, maxCharacters).trimEnd()}…`
}
