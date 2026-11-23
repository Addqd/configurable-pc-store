import { format, isValid, parse } from 'date-fns'
import { isoDate } from './params'

/**
 * Written form of a filter date: `ДД.ММ.ГГГГ`.
 *
 * The admin event journal filters by a local calendar day, so every helper here
 * works with local dates only: no value is ever shifted by the host timezone,
 * which is what the `YYYY-MM-DD` API contract expects.
 */
export const DATE_INPUT_FORMAT = 'dd.MM.yyyy'

const DATE_INPUT_PATTERN = /^\d{2}\.\d{2}\.\d{4}$/
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MAX_DIGITS = 8
/** The journal holds demo events only: older years cannot be real data. */
const MIN_YEAR = 1900

/**
 * Turns any typing state into `ДД.ММ.ГГГГ`, inserting the separators itself.
 *
 * Only digits are kept, so the caret can never produce a double separator, and a
 * separator appears as soon as the next group starts. Deleting characters
 * therefore shortens the text normally instead of re-adding a separator.
 */
export function maskDateText(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, MAX_DIGITS)
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, MAX_DIGITS)]
    .filter((group) => group.length > 0)
    .join('.')
}

/**
 * True when the text has the full `ДД.ММ.ГГГГ` shape, whether or not that day
 * exists. The field uses it to tell "still being typed" (`01.11.20`) from
 * "finished but impossible" (`31.02.2026`), which deserve different messages.
 */
export function isCompleteDateText(text: string): boolean {
  return DATE_INPUT_PATTERN.test(text)
}

/** Parses a complete `ДД.ММ.ГГГГ` text; `null` for partial or impossible dates. */
export function dateFromText(text: string): Date | null {
  if (!isCompleteDateText(text)) return null
  const parsed = parse(text, DATE_INPUT_FORMAT, new Date())
  if (!isValid(parsed)) return null
  if (parsed.getFullYear() < MIN_YEAR) return null
  // `parse` already rejects days outside the month (including leap years), but
  // the round trip keeps the check honest for a calendar day.
  return format(parsed, DATE_INPUT_FORMAT) === text ? parsed : null
}

/** `YYYY-MM-DD` → local calendar date, or `null` when the ISO text is unusable. */
export function dateFromIso(iso: string): Date | null {
  if (!ISO_PATTERN.test(iso)) return null
  const date = new Date(`${iso}T00:00:00`)
  return isValid(date) && isoDate(date) === iso ? date : null
}

/** `YYYY-MM-DD` → `ДД.ММ.ГГГГ` for the text field. */
export function textFromIso(iso: string): string {
  const date = dateFromIso(iso)
  return date ? format(date, DATE_INPUT_FORMAT) : ''
}
