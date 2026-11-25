import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { FiChevronDown, FiX } from 'react-icons/fi'
import {
  normalizeNumericText,
  numericAffixOf,
  numericTextFromOptionValue,
  type NumericLimitsInput,
} from '../../admin/characteristicDrafts'
import { localizedCountWord, localizedNumericOptionValue } from '../../i18n/characteristics'

/** One dictionary value of an editable numeric characteristic. */
export interface NumericComboOption {
  option_id: number
  value: string
}

interface NumericComboEntry {
  option: NumericComboOption
  /** Stable per-option id fragment of the listbox option element. */
  key: number
  /** Number read from the original dictionary wording, for filtering and ARIA. */
  numeric: string
  /** Localized presentation of the original dictionary wording. */
  label: string
}

/**
 * One integrated numeric ComboBox: an editable number, its fixed unit/prefix and
 * an attached list of the existing dictionary values.
 *
 * The control is a single element of the form — there is no second search field,
 * no extra "add option" button and no separate unit input. Typing filters the
 * dictionary inside the popup and never writes to it; an existing option is picked
 * with the mouse, Enter or the chevron, and the value is only persisted when the
 * whole product is saved.
 *
 * Accessibility follows the WAI-ARIA editable-combobox pattern: `role="combobox"`
 * on the input, a listbox popup, `aria-expanded`, `aria-controls`,
 * `aria-activedescendant`, `aria-autocomplete="list"`, Escape to close,
 * Arrow/Home/End to move and Enter to accept.
 */
export function NumericComboBox({
  id,
  name,
  text,
  limits,
  options,
  disabled,
  invalid,
  required,
  describedBy,
  onChangeText,
  onPick,
  onClear,
}: {
  id: string
  name: string
  text: string
  limits?: NumericLimitsInput | null
  options: readonly NumericComboOption[]
  disabled: boolean
  invalid: boolean
  required: boolean
  describedBy?: string
  onChangeText: (text: string) => void
  onPick: (optionId: number, text: string) => void
  onClear: () => void
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'ru'
  const listId = `${id}-listbox`
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  // Set while focus is moved back to the input by an action that must not reopen
  // the popup (an accepted option or an explicit clear).
  const stayClosedRef = useRef(false)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  // Whether the visible text was typed in this popup session. Opening the control
  // offers the whole dictionary; only typed text filters it.
  const [typedInPopup, setTypedInPopup] = useState(false)

  // The server orders the dictionary by numeric magnitude, so filtering keeps
  // that order instead of sorting by text. The original wording stays the value;
  // only its presentation is localized.
  const entries = useMemo<NumericComboEntry[]>(
    () =>
      options.map((option) => ({
        option,
        key: option.option_id,
        numeric: numericTextFromOptionValue(option.value),
        label: localizedNumericOptionValue(option.value, language),
      })),
    [options, language],
  )
  const typed = text.trim()
  const needle = typedInPopup ? typed.toLocaleLowerCase() : ''
  // A decimal comma typed for filtering is matched as a point; the draft itself is
  // never rewritten by the popup.
  const numericNeedle = normalizeNumericText(needle)
  const filtered = useMemo(() => {
    if (!needle) return entries
    return entries.filter(
      (entry) =>
        (numericNeedle !== '' && entry.numeric.startsWith(numericNeedle)) ||
        entry.label.toLocaleLowerCase().includes(needle) ||
        entry.option.value.toLocaleLowerCase().includes(needle),
    )
  }, [entries, needle, numericNeedle])

  const affix = numericAffixOf(
    limits,
    text,
    (forms, number) => localizedCountWord(forms, number, language),
  )
  const prefix = limits?.style === 'prefix' ? affix : ''
  const suffix = limits?.style === 'prefix' ? '' : affix
  const active = open && activeIndex >= 0 ? filtered[activeIndex] : undefined

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null
      if (target && wrapperRef.current && !wrapperRef.current.contains(target)) {
        // Closing keeps the typed text: only an explicit pick changes the value.
        setOpen(false)
        setActiveIndex(-1)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
    }
  }, [open])

  // A disabled control is never expanded, and the stored flag is dropped during
  // render so it cannot reappear when the form is unlocked again.
  if (disabled && open) {
    setOpen(false)
    setActiveIndex(-1)
  }

  // Keep the highlighted option inside the visible part of the popup.
  useEffect(() => {
    if (!open || activeIndex < 0) return
    const element = document.getElementById(`${listId}-option-${activeIndex}`)
    // A DOM implementation without layout (jsdom) has no `scrollIntoView`.
    if (typeof element?.scrollIntoView === 'function') {
      element.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex, listId, open])

  const openList = () => {
    if (disabled) return
    if (stayClosedRef.current) {
      stayClosedRef.current = false
      return
    }
    setOpen(true)
    setTypedInPopup(false)
  }

  const closeList = () => {
    setOpen(false)
    setActiveIndex(-1)
    setTypedInPopup(false)
  }

  const commit = (index: number) => {
    const entry = filtered[index]
    if (!entry) return
    // The original option id and its number are reported; the localized label is
    // presentation only and never becomes the value.
    onPick(entry.option.option_id, entry.numeric)
    closeList()
    stayClosedRef.current = true
    inputRef.current?.focus()
  }

  const move = (step: number) => {
    if (!open) {
      openList()
      return
    }
    const total = filtered.length
    if (total === 0) return
    setActiveIndex((current) => {
      if (current < 0) return step > 0 ? 0 : total - 1
      const next = current + step
      if (next < 0) return total - 1
      return next % total
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        move(1)
        return
      case 'ArrowUp':
        event.preventDefault()
        move(-1)
        return
      case 'Home':
        if (!open) return
        event.preventDefault()
        if (filtered.length > 0) setActiveIndex(0)
        return
      case 'End':
        if (!open) return
        event.preventDefault()
        if (filtered.length > 0) setActiveIndex(filtered.length - 1)
        return
      case 'Enter':
        if (!open || activeIndex < 0) return
        event.preventDefault()
        commit(activeIndex)
        return
      case 'Escape':
        if (!open) return
        // Escape closes the popup and commits nothing.
        event.preventDefault()
        event.stopPropagation()
        closeList()
        return
      case 'Tab':
        if (open) closeList()
        return
      default:
    }
  }

  return (
    <div className="relative min-w-0" ref={wrapperRef}>
      <div
        className={`pc-field flex h-11 w-full items-center gap-1 rounded-lg border bg-surface px-3.5 text-sm text-text-primary transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25 ${
          invalid ? 'border-danger' : 'border-border'
        } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
      >
        {prefix && (
          <span className="shrink-0 text-text-muted" aria-hidden="true">
            {prefix}
          </span>
        )}
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active ? `${listId}-option-${activeIndex}` : undefined}
          aria-invalid={invalid || undefined}
          aria-required={required || undefined}
          aria-describedby={describedBy}
          aria-label={name}
          value={text}
          disabled={disabled}
          onChange={(event) => {
            onChangeText(event.target.value)
            setOpen(true)
            setActiveIndex(-1)
            setTypedInPopup(true)
          }}
          onFocus={openList}
          onClick={openList}
          onKeyDown={onKeyDown}
          placeholder={t('admin.form.char_numeric_placeholder')}
          className="min-w-0 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none disabled:cursor-not-allowed"
        />
        {suffix && (
          <span className="shrink-0 text-text-muted" aria-hidden="true">
            {suffix}
          </span>
        )}
        {!required && typed !== '' && !disabled && (
          <button
            type="button"
            aria-label={t('admin.form.char_numeric_clear')}
            onClick={() => {
              onClear()
              closeList()
              stayClosedRef.current = true
              inputRef.current?.focus()
            }}
            className="shrink-0 rounded p-0.5 text-text-muted transition-colors hover:text-text-primary"
          >
            <FiX className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label={t('admin.form.char_numeric_toggle')}
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => {
            if (open) {
              closeList()
            } else {
              openList()
              inputRef.current?.focus()
            }
          }}
          className="shrink-0 rounded p-0.5 text-text-muted transition-colors hover:text-text-primary disabled:cursor-not-allowed"
        >
          <FiChevronDown
            className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      </div>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={name}
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-surface-2 py-1 shadow-[0_8px_24px_var(--color-shadow)]"
        >
          {filtered.length === 0 && (
            <li role="presentation" className="px-3 py-2 text-xs text-text-muted">
              {t('admin.form.char_select_empty')}
            </li>
          )}
          {filtered.map((entry, index) => (
            <li
              key={entry.key}
              id={`${listId}-option-${index}`}
              role="option"
              aria-selected={entry.numeric === typed}
              // Keeps focus in the input so the popup survives the click.
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => commit(index)}
              className={`cursor-pointer px-3 py-2 text-sm text-text-primary ${
                index === activeIndex ? 'bg-surface-3' : ''
              }`}
            >
              {entry.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
