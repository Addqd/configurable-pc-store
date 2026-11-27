import { createContext, useContext, useEffect } from 'react'

/**
 * Tells the always-mounted authentication modal that a fullscreen error page owns
 * the screen.
 *
 * The modal is rendered by `App` outside the routed subtree, so nothing about the
 * current route can hide it. An error page that keeps a login window on top of it
 * would hide the very state it is reporting, so the page registers itself here and
 * `App` skips the modal while a registration is active.
 */
export const FullscreenErrorContext = createContext<((active: boolean) => void) | null>(null)

/** Registers the calling fullscreen page for as long as it stays mounted. */
export function useFullscreenErrorRegistration(): void {
  const change = useContext(FullscreenErrorContext)
  useEffect(() => {
    if (!change) return
    change(true)
    return () => change(false)
  }, [change])
}
