import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router'

/**
 * Centralized route scroll behavior for the whole application.
 *
 * React Router's declarative `BrowserRouter` does not restore scroll positions and
 * the browser's own restoration is unreliable for client-side navigations, so this
 * single manager owns it:
 *
 * - the position of every history entry (`location.key`) is remembered;
 * - a `PUSH`/`REPLACE` navigation to a different page starts at the top;
 * - a `POP` navigation (Back/Forward) restores the position saved for that exact
 *   history entry, or starts at the top when nothing was saved;
 * - query-only changes (catalog filters, pagination, admin tabs) and hash targets
 *   keep their existing behavior and are never repositioned.
 *
 * It runs only when the location changes, never on data updates or background
 * refetches, and it never animates: a route change must not scroll smoothly.
 */
export function RouteScrollManager() {
  const location = useLocation()
  const navigationType = useNavigationType()
  const positions = useRef(new Map<string, number>())
  const activeKey = useRef(location.key)
  const previous = useRef({ pathname: location.pathname })
  const leaving = useRef<{ key: string; top: number; scrolls: number } | null>(null)
  /** Counts scroll events, so a captured position is only used while it is current. */
  const scrolls = useRef(0)
  /** A restored position that the page could not reach yet because it was loading. */
  const pending = useRef<{ key: string; top: number } | null>(null)

  useEffect(() => {
    // The browser must not compete with the positions kept here.
    const previousRestoration = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    const remember = () => {
      scrolls.current += 1
      positions.current.set(activeKey.current, window.scrollY)
    }
    // The page being left can be clamped before the effect below runs (the next
    // page may start shorter), so the position is also captured at the last moment
    // the outgoing page is still intact: a link click or a Back/Forward step.
    const capture = () => { leaving.current = { key: activeKey.current, top: window.scrollY, scrolls: scrolls.current } }
    // Deliberate scrolling wins over a restoration the page was still waiting for.
    const takeOver = () => { pending.current = null }
    window.addEventListener('scroll', remember, { passive: true })
    window.addEventListener('popstate', capture)
    window.addEventListener('wheel', takeOver, { passive: true })
    window.addEventListener('touchstart', takeOver, { passive: true })
    document.addEventListener('click', capture, true)
    return () => {
      window.removeEventListener('scroll', remember)
      window.removeEventListener('popstate', capture)
      window.removeEventListener('wheel', takeOver)
      window.removeEventListener('touchstart', takeOver)
      document.removeEventListener('click', capture, true)
      window.history.scrollRestoration = previousRestoration
    }
  }, [])

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return
    // Restored pages often paint a placeholder first. Finish the restoration once
    // the page has grown enough to hold the saved position.
    const observer = new ResizeObserver(() => {
      const target = pending.current
      if (!target || target.key !== activeKey.current) return
      const reachable = document.documentElement.scrollHeight - window.innerHeight >= target.top
      if (!reachable) return
      if (window.scrollY < target.top) window.scrollTo({ top: target.top, left: 0, behavior: 'instant' })
      if (window.scrollY >= target.top) pending.current = null
    })
    observer.observe(document.documentElement)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    const pathChanged = previous.current.pathname !== location.pathname
    // The captured position belongs to the entry that is being left, and it is the
    // value to trust for it. Switching the tracked key afterwards keeps the scroll
    // events caused by the step below on the entry that is being entered.
    const left = leaving.current
    leaving.current = null
    pending.current = null
    if (left && left.key === activeKey.current && left.scrolls === scrolls.current) {
      positions.current.set(left.key, left.top)
    }
    previous.current = { pathname: location.pathname }
    activeKey.current = location.key
    // A query-only change keeps the visitor on the same page, and an anchor has an
    // intended target: neither may be repositioned by route navigation.
    if (!pathChanged || location.hash) return
    const restored = navigationType === 'POP' ? positions.current.get(location.key) : undefined
    if (restored !== undefined) pending.current = { key: location.key, top: restored }
    window.scrollTo({ top: restored ?? 0, left: 0, behavior: 'instant' })
    if (restored !== undefined && window.scrollY >= restored) pending.current = null
  }, [location.key, location.pathname, location.hash, navigationType])

  return null
}
