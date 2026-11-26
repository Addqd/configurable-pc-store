import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { FiChevronDown } from 'react-icons/fi'
import { useCurrencyStore } from '../stores/currencyStore'
import { useCurrencyDisplay, moneyLocale } from '../utils/useFormatPrice'
import {
  CURRENCY_SYMBOLS,
  SUPPORTED_CURRENCIES,
  type Currency,
} from '../utils/currency'

interface CurrencySwitcherProps {
  className?: string
}

/** Distance between the trigger and the panel, matching the approved reference. */
const PANEL_GAP = 2

interface PanelPosition {
  top: number
  left: number
  width: number
}

/** Effective provider date shown verbatim, without a local-time shift. */
function formatRateDate(isoDate: string, locale: string): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return isoDate
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(parsed)
}

/**
 * Currency picker for the header.
 *
 * RUB is always selected by default and the dropdown offers exactly three plain
 * options. The trigger stays neutral: selection state is carried by the menu row,
 * not by a permanent accent border.
 */
export function CurrencySwitcher({ className = '' }: CurrencySwitcherProps) {
  const { t, i18n } = useTranslation()
  const currency = useCurrencyStore((state) => state.currency)
  const setCurrency = useCurrencyStore((state) => state.setCurrency)
  const { rateAvailable, rateLoading, stale, rateDate } = useCurrencyDisplay()
  // A first fetch in flight is not an outage: the badge appears only once the
  // rates are known to be unavailable.
  const ratesUnavailable = !rateAvailable && !rateLoading
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<PanelPosition | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])
  const statusId = useId()

  const statusMessage = (() => {
    if (currency === 'RUB') return null
    if (!rateAvailable) return ratesUnavailable ? t('currency.rate_unavailable') : null
    if (!rateDate) return null
    const date = formatRateDate(rateDate, moneyLocale(i18n.resolvedLanguage ?? i18n.language))
    return stale
      ? t('currency.rate_stale', { date })
      : t('currency.rate_status', { date })
  })()

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  const focusOption = useCallback((index: number) => {
    optionRefs.current[index]?.focus()
  }, [])

  const selectCurrency = useCallback(
    (next: Currency) => {
      setCurrency(next)
      close(true)
    },
    [close, setCurrency],
  )

  // The panel lives in a portal: inside the header it would be trapped in the
  // header's own stacking context and could be covered by another header popup.
  useLayoutEffect(() => {
    if (!open) return
    const updatePosition = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      setPosition({
        top: rect.bottom + PANEL_GAP,
        left: rect.left,
        width: rect.width,
      })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  // Keyboard users land on the current selection as soon as the menu opens.
  useEffect(() => {
    if (!open) return
    const index = SUPPORTED_CURRENCIES.indexOf(currency)
    focusOption(index < 0 ? 0 : index)
  }, [open, currency, focusOption])

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (panelRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close(true)
        return
      }
      if (event.key === 'Tab') {
        setOpen(false)
        return
      }
      const count = SUPPORTED_CURRENCIES.length
      const currentIndex = optionRefs.current.findIndex(
        (element) => element === document.activeElement,
      )
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        focusOption((currentIndex + 1) % count)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        focusOption(currentIndex <= 0 ? count - 1 : currentIndex - 1)
      } else if (event.key === 'Home') {
        event.preventDefault()
        focusOption(0)
      } else if (event.key === 'End') {
        event.preventDefault()
        focusOption(count - 1)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, close, focusOption])

  return (
    // Mobile layout is out of scope for this task and the header already
    // overflows below `sm`, so the control renders from `sm` upward only.
    <div className={`relative hidden sm:block ${className}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault()
            setOpen(true)
          }
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('currency.trigger', { code: currency })}
        aria-describedby={statusMessage ? statusId : undefined}
        title={statusMessage ?? undefined}
        className="relative inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface pl-3 pr-3.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span aria-hidden="true" className="text-text-secondary">
          {CURRENCY_SYMBOLS[currency]}
        </span>
        <span>{currency}</span>
        <FiChevronDown aria-hidden="true" className="ml-1 h-3.5 w-3.5 text-text-muted" />
        {ratesUnavailable && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500"
          />
        )}
      </button>
      {statusMessage && (
        <span id={statusId} className="sr-only">
          {statusMessage}
        </span>
      )}

      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            aria-label={t('currency.label')}
            style={{
              position: 'fixed',
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              width: position?.width,
              visibility: position ? 'visible' : 'hidden',
            }}
            className="z-[150] rounded-lg border border-border bg-surface p-2 shadow-[0_8px_30px_var(--color-shadow-md)]"
          >
            {SUPPORTED_CURRENCIES.map((option, index) => {
              const selected = option === currency
              return (
                <button
                  key={option}
                  ref={(element) => {
                    optionRefs.current[index] = element
                  }}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  onClick={() => selectCurrency(option)}
                  className={
                    'flex w-full items-center gap-1.5 rounded-md px-2 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ' +
                    (selected
                      ? 'bg-primary-light font-semibold text-text-primary'
                      : 'font-medium text-text-primary hover:bg-surface-3')
                  }
                >
                  <span aria-hidden="true" className="text-text-secondary">
                    {CURRENCY_SYMBOLS[option]}
                  </span>
                  <span>{option}</span>
                </button>
              )
            })}
          </div>,
          document.body,
        )}
    </div>
  )
}
