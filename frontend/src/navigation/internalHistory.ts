import { createContext, useCallback, useContext } from 'react'
import {
  useLocation, useNavigate,
  type Location, type NavigateFunction, type NavigationType,
} from 'react-router'

/** One browser-history entry this session created for the application itself. */
interface InternalEntry {
  key: string
  pathname: string
  search: string
}

/** Upper bound on remembered entries: a long session must not accumulate forever. */
const MAX_ENTRIES = 100

/**
 * Tracks which browser-history entries this application actually created.
 *
 * React Router reports *how* the router arrived (`PUSH`, `REPLACE`, `POP`), so the
 * tracker can reproduce the real stack semantics without reading `window.history`:
 *
 * - `PUSH` appends an entry, so the entry before it is a known internal page;
 * - `REPLACE` replaces the current entry and creates no earlier entry, so a first
 *   entry that is replaced still has nothing before it;
 * - `POP` moves to an entry that must already be known here (Back/Forward);
 * - an unknown `POP` (reload, a fresh document, a restored session) proves nothing,
 *   so the earlier stack is discarded and navigation stays conservative.
 *
 * `window.history.length`, a non-default location key and `document.referrer` are
 * deliberately not used as evidence: none of them proves that the previous browser
 * entry belongs to this application.
 */
export class InternalHistoryTracker {
  private entries: InternalEntry[] = []
  private index = -1
  /** Entries that showed a fullscreen error: Back must not step into them again. */
  private readonly failed = new Set<string>()

  /** Records the current location. Re-recording the same entry is a no-op. */
  record(location: Pick<Location, 'key' | 'pathname' | 'search'>, navigationType: NavigationType): void {
    const entry: InternalEntry = { key: location.key, pathname: location.pathname, search: location.search }
    const current = this.entries[this.index]
    if (current && current.key === entry.key && current.pathname === entry.pathname && current.search === entry.search) return

    if (navigationType === 'PUSH') {
      this.entries = [...this.entries.slice(0, this.index + 1), entry].slice(-MAX_ENTRIES)
      this.index = this.entries.length - 1
      return
    }

    if (navigationType === 'REPLACE') {
      if (this.index < 0) {
        this.entries = [entry]
        this.index = 0
        return
      }
      // A replacement stays at the same position: it never becomes a previous page.
      this.entries = this.entries.map((known, position) => (position === this.index ? entry : known))
      return
    }

    const found = this.entries.findIndex(known => known.key === entry.key)
    if (found === -1) {
      this.entries = [entry]
      this.index = 0
      return
    }
    this.index = found
  }

  /** Remembers that this entry renders a fullscreen error page. */
  markFailed(key: string): void {
    this.failed.add(key)
  }

  /**
   * Leaves the error page: back to the previous internal page when one is proven and
   * is not itself a failed page, otherwise to the storefront, replacing the failed
   * entry so Back cannot return to it.
   */
  back(navigate: NavigateFunction): void {
    const previous = this.index > 0 ? this.entries[this.index - 1] : undefined
    if (previous && !this.failed.has(previous.key)) {
      // The entry exists in the real browser stack, so a POP restores it without
      // adding another history entry.
      navigate(-1)
      return
    }
    navigate('/', { replace: true })
  }
}

/** Shared with the provider component; `null` means no tracker is mounted. */
export const InternalHistoryContext = createContext<InternalHistoryTracker | null>(null)

export interface InternalHistoryControls {
  /** "Back" for a fullscreen page: previous internal page, or the storefront. */
  back: () => void
  /** Marks the entry that is showing a fullscreen error. */
  reportFailedEntry: () => void
}

/**
 * Navigation controls for a fullscreen error page.
 *
 * Without a provider (an isolated render of the page) the tracker has no evidence,
 * so the conservative fallback applies as well.
 */
export function useInternalHistory(): InternalHistoryControls {
  const tracker = useContext(InternalHistoryContext)
  const navigate = useNavigate()
  const location = useLocation()

  const back = useCallback(() => {
    if (!tracker) {
      navigate('/', { replace: true })
      return
    }
    tracker.back(navigate)
  }, [tracker, navigate])

  const reportFailedEntry = useCallback(() => {
    tracker?.markFailed(location.key)
  }, [tracker, location.key])

  return { back, reportFailedEntry }
}
