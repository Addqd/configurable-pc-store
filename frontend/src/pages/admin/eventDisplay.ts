import i18n from '../../i18n'
import type { AdminEventOut } from '../../api/generated/model'

const TARGET_CATEGORIES = new Set(['admin', 'catalog', 'review', 'build', 'order'])

export function eventTypeLabel(event: AdminEventOut): string {
  const key = `admin.events.types.${event.event_type.replaceAll('.', '_')}`
  const label = i18n.t(key, { defaultValue: event.event_type })
  if (event.target_id !== null && event.target_id !== undefined && TARGET_CATEGORIES.has(event.category)) {
    return `${label} ${i18n.t('admin.events.target', { id: event.target_id })}`
  }
  return label
}

/**
 * Display name of the event actor for the «Имя пользователя» column.
 *
 * The real `users.username` is used whenever it resolves; for an account that no
 * longer exists the historical snapshot recorded with the event is shown. Only
 * when neither is available does the localized role label appear — a username is
 * never invented. System/unknown actors get their localized label instead.
 */
export function eventActorName(event: AdminEventOut): string {
  if (event.actor_user_id === null || event.actor_user_id === undefined) {
    return event.category === 'auth' ? i18n.t('admin.events.actor_unknown') : i18n.t('admin.events.actor_system')
  }
  const username = event.actor_username?.trim()
  if (username) return username
  if (event.actor_role === 'owner') return i18n.t('admin.events.actor_owner_fallback')
  if (event.actor_role === 'admin') return i18n.t('admin.events.actor_admin_fallback')
  return i18n.t('admin.events.actor_user_fallback')
}

/** Numeric actor id rendered in its own column; null for system/unknown actors. */
export function eventActorId(event: AdminEventOut): number | null {
  return event.actor_user_id ?? null
}

/**
 * Compact localized role marker rendered beside a resolved username, so an
 * administrator or the owner stays distinguishable from an ordinary user.
 *
 * It is omitted when no username resolves, because the role fallback label
 * (`Администратор (недоступен)`) already states the role, and for ordinary users
 * to avoid extra visual noise.
 */
export function eventActorRole(event: AdminEventOut): string | null {
  if (!event.actor_username?.trim()) return null
  if (event.actor_role === 'owner') return i18n.t('admin.events.actor_role_owner')
  if (event.actor_role === 'admin') return i18n.t('admin.events.actor_role_admin')
  return null
}

export function eventCategoryLabel(category: string): string {
  return i18n.t(`admin.events.categories.${category}`, { defaultValue: category })
}

export function eventOutcomeLabel(outcome: string): string {
  return outcome === 'failure' ? i18n.t('admin.events.failure') : i18n.t('admin.events.success')
}

export function eventDetailsLine(event: AdminEventOut): string | null {
  const details = event.details ?? {}
  const from = typeof details.from === 'string' ? details.from : null
  const to = typeof details.to === 'string' ? details.to : null
  const parts: string[] = []
  if (from && to) parts.push(`${from} → ${to}`)
  if (event.reason) parts.push(event.reason)
  const changed = Array.isArray(details.changed_fields) ? details.changed_fields.filter((item: unknown): item is string => typeof item === 'string') : []
  if (changed.length > 0) parts.push(changed.join(', '))
  return parts.length > 0 ? parts.join(' · ') : null
}

export function formatEventTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(i18n.resolvedLanguage === 'en' ? 'en-GB' : 'ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date)
}
