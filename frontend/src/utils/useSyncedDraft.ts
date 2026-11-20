import { useState } from 'react'

interface DraftState {
  source: string
  text: string
}

/**
 * Keeps a local input draft in sync with an external URL value.
 *
 * Adjusting the draft during render (instead of in an effect) is React's
 * documented pattern for state derived from a prop: when the URL changes through
 * Back/Forward or an external link, the input is rehydrated before paint without
 * an extra render pass.
 */
export function useSyncedDraft(source: string): [string, (text: string) => void] {
  const [draft, setDraft] = useState<DraftState>({ source, text: source })
  if (draft.source !== source) setDraft({ source, text: source })
  return [draft.text, (text: string) => setDraft({ source, text })]
}
