import { useEffect, useRef, useState } from 'react'

interface DraftState {
  source: string
  text: string
  /** Value written to the URL by this draft, used to recognise our own echo. */
  ownWrite: string | null
}

/**
 * Keeps a debounced search draft in sync with the URL value that owns it.
 *
 * The draft is committed to the URL *from the debounce timer* instead of
 * exposing a debounced value that a separate effect compares with the URL:
 * when the URL changes from outside (Back/Forward, a filter reset), the pending
 * timer is cancelled and the draft is rehydrated, so an old keystroke can never
 * overwrite the newly restored query.
 *
 * Adjusting the draft during render is React's documented pattern for state
 * derived from a prop, so the input updates before paint.
 */
export function useSyncedDraft(
  source: string,
  onCommit: (value: string) => void,
  delayMs = 300,
): [string, (text: string) => void] {
  const [draft, setDraft] = useState<DraftState>({ source, text: source, ownWrite: null })
  const commitRef = useRef(onCommit)
  useEffect(() => {
    commitRef.current = onCommit
  })

  if (draft.source !== source) {
    // Our own write landed: adopt the new source but keep newer keystrokes.
    // Anything else is external navigation and wins over the local draft.
    const keepsTyping = draft.ownWrite === source && draft.text !== source
    setDraft({ source, text: keepsTyping ? draft.text : source, ownWrite: null })
  }

  const text = draft.text
  useEffect(() => {
    if (text === source) return
    const timer = setTimeout(() => {
      setDraft((current) => (current.text === text ? { ...current, ownWrite: text } : current))
      commitRef.current(text)
    }, delayMs)
    return () => clearTimeout(timer)
  }, [text, source, delayMs])

  return [text, (next: string) => setDraft((current) => ({ ...current, text: next }))]
}
