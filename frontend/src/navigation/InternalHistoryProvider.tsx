import { useEffect, useState, type ReactNode } from 'react'
import { useLocation, useNavigationType } from 'react-router'
import { InternalHistoryContext, InternalHistoryTracker } from './internalHistory'

/**
 * Router-level tracker of internal history.
 *
 * It has to live inside the router because it reads the current location and the
 * navigation action; nothing else is shared with the rest of the application.
 */
export function InternalHistoryProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigationType = useNavigationType()
  const [tracker] = useState(() => new InternalHistoryTracker())

  useEffect(() => {
    tracker.record(location, navigationType)
  }, [tracker, location, navigationType])

  return <InternalHistoryContext.Provider value={tracker}>{children}</InternalHistoryContext.Provider>
}
