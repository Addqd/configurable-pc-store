import { useState, type FocusEvent, type KeyboardEvent, type MouseEvent } from 'react'
import DatePicker from 'react-datepicker'
import { useTranslation } from 'react-i18next'
import { enGB } from 'date-fns/locale/en-GB'
import { ru } from 'date-fns/locale/ru'
import {
  dateFromIso,
  dateFromText,
  isCompleteDateText,
  maskDateText,
  textFromIso,
} from '../../admin/dateInput'
import { isoDate } from '../../admin/params'
import { adminControl } from './adminStyles'

interface DateFilterFieldProps {
  id: string
  label: string
  /** ISO date (`YYYY-MM-DD`) currently applied by the URL, empty when unset. */
  value: string
  /** Called only with a complete `YYYY-MM-DD` date, or with `''` for "no date". */
  onChange: (iso: string) => void
}

type RawChangeEvent = MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>

/**
 * One admin date filter: a `ДД.ММ.ГГГГ` text input plus the approved calendar.
 *
 * The same field serves both typing and picking, so the two can never disagree:
 * a typed date moves the calendar, a picked day rewrites the text, and only a
 * complete, real calendar day (leap years included) ever reaches `onChange` and
 * therefore the API.
 *
 * The draft and the applied filter stay two separate things. A draft that cannot
 * be applied is never presented as the active filter: the field says that it was
 * not applied and, when a date is still filtering the journal, which date that is.
 */
export function DateFilterField({ id, label, value, onChange }: DateFilterFieldProps) {
  const { i18n, t } = useTranslation()
  const [draft, setDraft] = useState(() => textFromIso(value))
  // An unfinished date is reported once the admin leaves the field, never while
  // it is still being typed.
  const [leftField, setLeftField] = useState(false)
  // URL-driven state (back/forward, reset) is the source of truth. It is
  // adjusted during render instead of in an effect, so the field never renders a
  // stale value for a frame.
  const [syncedValue, setSyncedValue] = useState(value)
  if (value !== syncedValue) {
    setSyncedValue(value)
    setDraft(textFromIso(value))
    setLeftField(false)
  }
  const noticeId = `${id}-notice`

  const appliedText = textFromIso(value)
  const draftIsComplete = isCompleteDateText(draft)
  const draftDate = dateFromText(draft)
  // A draft that differs from the applied filter: either a finished but
  // impossible day (reported immediately) or an unfinished one (after blur).
  const notApplied =
    draft !== appliedText && (draftIsComplete || leftField) && draftDate === null

  const commit = (next: string) => {
    if (next !== value) onChange(next)
  }

  /**
   * The picker's text input is fully controlled by `draft`: the raw change is
   * consumed here (with the picker's own parsing cancelled) and re-emitted as a
   * masked value, so separators appear while typing.
   */
  const handleRawChange = (event?: RawChangeEvent) => {
    if (!event || event.type !== 'change') return
    event.preventDefault()
    const target = event.target as unknown as { value?: string }
    const masked = maskDateText(target.value ?? '')
    setDraft(masked)
    setLeftField(false)
    if (masked === '') {
      commit('')
      return
    }
    const parsed = dateFromText(masked)
    if (parsed) commit(isoDate(parsed))
  }

  const handlePick = (date: Date | null) => {
    if (!date) {
      setDraft('')
      setLeftField(false)
      commit('')
      return
    }
    const next = isoDate(date)
    setDraft(textFromIso(next))
    setLeftField(false)
    commit(next)
  }

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as HTMLElement | null
    if (next?.closest('.pc-datepicker-popper')) return
    setLeftField(true)
  }

  return (
    <div className="min-w-[140px] flex-1" onBlur={handleBlur}>
      {/* The status sits in the label row: the calendar popper opens right below
          the input, so a message under the field would be covered while typing. */}
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs text-text-muted">{label}</label>
        {notApplied && (
          <span id={noticeId} role="alert" className="text-right text-xs text-danger">
            {draftIsComplete
              ? t('admin.events.date_not_applied')
              : t('admin.events.date_incomplete')}
            {appliedText ? ` ${t('admin.events.date_previous_active', { date: appliedText })}` : ''}
          </span>
        )}
      </div>
      <DatePicker
        id={id}
        value={draft}
        onChangeRaw={handleRawChange}
        onChange={handlePick}
        selected={dateFromIso(value)}
        dateFormat="dd.MM.yyyy"
        locale={i18n.resolvedLanguage === 'en' ? enGB : ru}
        placeholderText="ДД.ММ.ГГГГ"
        autoComplete="off"
        className={`${adminControl} h-9`}
        popperPlacement="bottom-start"
        popperClassName="pc-datepicker-popper"
        showPopperArrow={false}
        aria-invalid={notApplied ? 'true' : undefined}
        aria-describedby={notApplied ? noticeId : undefined}
      />
    </div>
  )
}
