import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { FiX } from 'react-icons/fi'
import { useTranslation } from 'react-i18next'

interface AdminDialogProps {
  open: boolean
  onClose: () => void
  /** Blocks Escape/backdrop closing while a destructive request is in flight. */
  closeDisabled?: boolean
  labelledBy?: string
  widthClass?: string
  children: ReactNode
}

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

/** Mount order of dialogs; the highest open sequence is the one painted on top. */
let dialogSequence = 0

/**
 * Accessible overlay used by every admin modal: portal, scroll lock, initial
 * focus, Tab containment, Escape to close and focus restoration.
 */
export function AdminDialog({
  open,
  onClose,
  closeDisabled = false,
  labelledBy,
  widthClass = 'max-w-[620px]',
  children,
}: AdminDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  const disabledRef = useRef(closeDisabled)
  const [instanceId] = useState(() => ++dialogSequence)

  useEffect(() => {
    closeRef.current = onClose
    disabledRef.current = closeDisabled
  })

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusables = () =>
      Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      )
    const first = focusables().find((element) => !element.hasAttribute('data-dialog-close'))
    ;(first ?? panelRef.current)?.focus()
    // A dialog opened on top of another (e.g. a delete confirmation above an
    // editor) owns the keyboard while it is open.
    const isTopmost = () => {
      let topSequence = instanceId
      document.querySelectorAll<HTMLElement>('[data-admin-dialog-root]').forEach((root) => {
        topSequence = Math.max(topSequence, Number(root.dataset.adminDialogSequence ?? 0))
      })
      return instanceId >= topSequence
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      // A stacked dialog (e.g. the delete confirmation above an editor) owns the
      // keyboard while it is open.
      if (!isTopmost()) return
      if (event.key === 'Escape') {
        event.stopPropagation()
        if (!disabledRef.current) closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) {
        // Nothing to tab to (every control is disabled while a request runs):
        // keep focus on the panel instead of letting it escape to the page.
        event.preventDefault()
        panelRef.current?.focus()
        return
      }
      const firstItem = items[0]
      const lastItem = items[items.length - 1]
      const activeIndex = items.indexOf(document.activeElement as HTMLElement)
      if (activeIndex === -1) {
        // Focus sits on the panel itself or escaped the dialog: pull it back to
        // the nearest edge in the direction the user is tabbing.
        event.preventDefault()
        ;(event.shiftKey ? lastItem : firstItem).focus()
      } else if (event.shiftKey && activeIndex === 0) {
        event.preventDefault()
        lastItem.focus()
      } else if (!event.shiftKey && activeIndex === items.length - 1) {
        event.preventDefault()
        firstItem.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.body.style.overflow = previousOverflow
      previous?.focus()
    }
  }, [open, instanceId])

  if (!open) return null

  return createPortal(
    <div
      data-admin-dialog-root
      data-admin-dialog-sequence={instanceId}
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/45 px-4 py-[6vh] backdrop-blur-[2px] sm:items-center sm:py-8"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !closeDisabled) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`${widthClass} w-full rounded-2xl border border-border bg-surface p-6 shadow-[0_24px_70px_var(--color-shadow-md)] focus:outline-none sm:p-8`}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

interface AdminDialogCloseProps {
  onClick: () => void
  disabled?: boolean
  label?: string
}

export function AdminDialogClose({ onClick, disabled = false, label }: AdminDialogCloseProps) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      data-dialog-close
      onClick={onClick}
      disabled={disabled}
      aria-label={label ?? t('admin.common.close')}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-3 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
    >
      <FiX className="h-5 w-5" />
    </button>
  )
}

