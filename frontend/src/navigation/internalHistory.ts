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
  /**
   * Entries that showed a fullscreen error: Back must not step into them again.
   *
   * A marker lives exactly as long as its history entry: `record()` drops the markers of
   * every entry it discarded (PUSH truncation, REPLACE, the 100-entry cap, an unknown POP
   * reset), and `reportHealthyEntry()` drops a marker as soon as the same entry renders
   * normal page content again. Bounded by `MAX_ENTRIES` like the entry list itself.
   */
  private readonly failed = new Set<string>()
  /**
   * The entry whose error page is mounted right now.
   *
   * It is written by the error page's own effect, which React runs before the provider's
   * effects (children before ancestors), so it is already up to date when the tracker
   * records the new location. That is what stops a freshly mounted error page from
   * losing its marker to the "this entry looks healthy" check in the same commit.
   */
  private claimed: string | null = null

  /** Records the current location. Re-recording the same entry is a no-op. */
  record(location: Pick<Location, 'key' | 'pathname' | 'search'>, navigationType: NavigationType): void {
    const entry: InternalEntry = { key: location.key, pathname: location.pathname, search: location.search }
    const current = this.entries[this.index]
    if (current && current.key === entry.key && current.pathname === entry.pathname && current.search === entry.search) return

    if (navigationType === 'PUSH') {
      this.entries = [...this.entries.slice(0, this.index + 1), entry].slice(-MAX_ENTRIES)
      this.index = this.entries.length - 1
      this.forgetDiscardedEntries()
      return
    }

    if (navigationType === 'REPLACE') {
      if (this.index < 0) {
        this.entries = [entry]
        this.index = 0
        this.forgetDiscardedEntries()
        return
      }
      // A replacement stays at the same position: it never becomes a previous page.
      this.entries = this.entries.map((known, position) => (position === this.index ? entry : known))
      this.forgetDiscardedEntries()
      return
    }

    const found = this.entries.findIndex(known => known.key === entry.key)
    if (found === -1) {
      // Nothing proves where this entry came from, so the previous stack is discarded
      // together with the failure markers that described it.
      this.entries = [entry]
      this.index = 0
      this.forgetDiscardedEntries()
      return
    }
    this.index = found
  }

  /** Drops the failure markers of every entry the last `record()` did not keep. */
  private forgetDiscardedEntries(): void {
    const kept = new Set(this.entries.map(entry => entry.key))
    for (const key of this.failed) if (!kept.has(key)) this.failed.delete(key)
  }

  /** How many entries are currently marked as failed; never more than `MAX_ENTRIES`. */
  get failedEntryCount(): number {
    return this.failed.size
  }

  /** Remembers that this entry renders a fullscreen error page. Idempotent. */
  markFailedEntry(key: string): void {
    this.failed.add(key)
    this.claimed = key
  }

  /**
   * The error page left this entry. The failure marker stays: navigating away is not a
   * recovery, only the entry proving that it works again is.
   */
  releaseEntry(key: string): void {
    if (this.claimed === key) this.claimed = null
  }

  /**
   * The current entry renders normal page content: a previous failure no longer applies.
   * A mounted error page always wins, so a new error can never be undone by effect order.
   * Idempotent.
   */
  reportHealthyEntry(key: string): void {
    if (this.claimed === key) return
    this.failed.delete(key)
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
  /** Releases that claim when the error page unmounts; the marker itself stays. */
  releaseFailedEntry: () => void
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
    tracker?.markFailedEntry(location.key)
  }, [tracker, location.key])

  const releaseFailedEntry = useCallback(() => {
    tracker?.releaseEntry(location.key)
  }, [tracker, location.key])

  return { back, reportFailedEntry, releaseFailedEntry }
}
