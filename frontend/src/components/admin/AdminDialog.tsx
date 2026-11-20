import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
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

/** Every rendered dialog root, i.e. every dialog that is open right now. */
const DIALOG_ROOT_SELECTOR = '[data-admin-dialog-root]'

/**
 * Nesting depth of a dialog inside another dialog. A confirmation rendered from
 * an open editor is one level deeper and therefore paints above it, whatever the
 * order in which the two mounted or registered their portals.
 */
const DialogDepthContext = createContext(0)

/**
 * Owned stack: one entry per dialog that is currently open.
 *
 * Sorted by nesting depth and then by opening time, so the last entry is always
 * the dialog the user is working in. Entries are added when a dialog opens and
 * removed when it closes or unmounts — component mount order is never used, since
 * a dialog can be mounted long before the administrator opens it.
 */
interface OpenDialog {
  depth: number
  openedAt: number
}

const openDialogs: OpenDialog[] = []
let openedCount = 0

function registerOpenDialog(entry: OpenDialog) {
  entry.openedAt = ++openedCount
  openDialogs.push(entry)
  openDialogs.sort((left, right) => left.depth - right.depth || left.openedAt - right.openedAt)
}

function unregisterOpenDialog(entry: OpenDialog) {
  const index = openDialogs.indexOf(entry)
  if (index >= 0) openDialogs.splice(index, 1)
}

/**
 * Open dialogs counted across the whole page, so a nested dialog that closes can
 * never unlock the page while its parent is still open.
 */
let openDialogCount = 0
let storedBodyOverflow = ''

function lockPageScroll() {
  if (openDialogCount === 0) storedBodyOverflow = document.body.style.overflow
  openDialogCount += 1
  document.body.style.overflow = 'hidden'
}

function unlockPageScroll() {
  openDialogCount = Math.max(0, openDialogCount - 1)
  if (openDialogCount === 0) document.body.style.overflow = storedBodyOverflow
}

/**
 * Accessible overlay used by every admin modal: portal, scroll lock, initial
 * focus, Tab containment, Escape to close and focus restoration.
 *
 * Keyboard ownership belongs to the topmost **open** dialog only, so a dialog
 * that was mounted closed and opened later takes control from the dialog below
 * it, and a nested confirmation always owns the keyboard of its parent.
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
  const depth = useContext(DialogDepthContext)

  useEffect(() => {
    closeRef.current = onClose
    disabledRef.current = closeDisabled
  })

  useEffect(() => {
    if (!open) return
    const entry: OpenDialog = { depth, openedAt: 0 }
    registerOpenDialog(entry)
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    lockPageScroll()
    const focusables = () =>
      Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      )
    /** True for the dialog the user opened most recently, i.e. the one on top. */
    const isTopmost = () => openDialogs[openDialogs.length - 1] === entry
    // Only the dialog that owns the stack takes the initial focus: a dialog that
    // opens underneath an already-open one must not pull focus out of it.
    if (isTopmost()) {
      const first = focusables().find((element) => !element.hasAttribute('data-dialog-close'))
      ;(first ?? panelRef.current)?.focus()
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
      unregisterOpenDialog(entry)
      unlockPageScroll()
      // Closing restores the element that opened this dialog, unless another
      // dialog is still open and the previous focus target lives outside it:
      // then focus must stay where the user is actually working.
      const openRoots = Array.from(document.querySelectorAll<HTMLElement>(DIALOG_ROOT_SELECTOR))
      const insideOpenDialog = previous ? openRoots.some((root) => root.contains(previous)) : false
      if (previous?.isConnected && (openRoots.length === 0 || insideOpenDialog)) previous.focus()
    }
  }, [open, depth])

  if (!open) return null

  return createPortal(
    <div
      data-admin-dialog-root
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/45 px-4 py-[6vh] backdrop-blur-[2px] sm:items-center sm:py-8"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !closeDisabled) onClose()
      }}
    >
      <DialogDepthContext.Provider value={depth + 1}>
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
      </DialogDepthContext.Provider>
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

