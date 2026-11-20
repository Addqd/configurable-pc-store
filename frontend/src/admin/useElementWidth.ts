import { useCallback, useState } from 'react'

/**
 * Tracks the content width of an element with `ResizeObserver`.
 *
 * The returned value is a **callback ref**: React calls it with the DOM node when
 * the element is attached and with the cleanup (or `null`) when it is detached.
 * That matters for charts whose container only exists after data arrives — an
 * effect with an empty dependency list would observe the first render's missing
 * node forever and keep reporting the fallback width.
 *
 * `fallback` is used before the first measurement and in environments without
 * `ResizeObserver` (jsdom, older browsers).
 */
export function useElementWidth(fallback: number) {
  const [width, setWidth] = useState(fallback)

  const ref = useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    const Observer = node.ownerDocument.defaultView?.ResizeObserver
    if (!Observer) return
    const apply = (measured: number) => {
      const rounded = Math.round(measured)
      if (rounded > 0) setWidth(rounded)
    }
    const observer = new Observer((entries) => {
      apply(entries[0]?.contentRect.width ?? 0)
    })
    observer.observe(node)
    // A newly attached node has never been measured: `ResizeObserver` only
    // reports on the next frame, which would leave one render at the fallback.
    apply(node.getBoundingClientRect().width)
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
