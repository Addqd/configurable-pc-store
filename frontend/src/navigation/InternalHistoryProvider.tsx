import { useEffect, useState, type ReactNode } from 'react'
import { useLocation, useNavigationType } from 'react-router'
import { InternalHistoryContext, InternalHistoryTracker } from './internalHistory'

/**
 * Router-level tracker of internal history.
 *
 * It has to live inside the router because it reads the current location and the
 * navigation action; nothing else is shared with the rest of the application.
 *
 * `errorActive` says whether a fullscreen error page is registered right now. It exists
 * only to re-run the recovery check when the last error page goes away without a
 * navigation — an entry that starts rendering normal content again must become a valid
 * Back destination again.
 */
export function InternalHistoryProvider({ children, errorActive = false }: { children: ReactNode; errorActive?: boolean }) {
  const location = useLocation()
  const navigationType = useNavigationType()
  const [tracker] = useState(() => new InternalHistoryTracker())

  useEffect(() => {
    tracker.record(location, navigationType)
  }, [tracker, location, navigationType])

  // The entry on screen renders normal content, so a previous failure no longer applies.
  // The error page claims its own entry from a child effect that React runs before this
  // one, so a freshly mounted error page keeps its marker even though `errorActive` only
  // turns on in a later commit.
  useEffect(() => {
    if (errorActive) return
    tracker.reportHealthyEntry(location.key)
  }, [tracker, errorActive, location.key])

  return <InternalHistoryContext.Provider value={tracker}>{children}</InternalHistoryContext.Provider>
}
