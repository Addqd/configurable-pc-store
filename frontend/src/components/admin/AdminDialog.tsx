import { useEffect, useRef, type ReactNode } from 'react'
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

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        if (!disabledRef.current) closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const firstItem = items[0]
      const lastItem = items[items.length - 1]
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault()
        lastItem.focus()
      } else if (!event.shiftKey && document.activeElement === lastItem) {
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
  }, [open])

  if (!open) return null

  return createPortal(
    <div
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

