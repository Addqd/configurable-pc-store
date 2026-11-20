import { useId } from 'react'

/** Unique heading id helper for dialogs. Kept outside the component module for Fast Refresh. */
export function useDialogTitleId(prefix: string): string {
  const id = useId()
  return `${prefix}-${id}`
}
