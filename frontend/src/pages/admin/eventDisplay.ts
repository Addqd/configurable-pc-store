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

export function eventActorLabel(event: AdminEventOut): string {
  if (event.actor_user_id === null || event.actor_user_id === undefined) {
    return event.category === 'auth' ? i18n.t('admin.events.actor_unknown') : i18n.t('admin.events.actor_system')
  }
  if (event.actor_role === 'owner') return i18n.t('admin.events.actor_owner', { id: event.actor_user_id })
  if (event.actor_role === 'admin') return i18n.t('admin.events.actor_admin', { id: event.actor_user_id })
  return i18n.t('admin.events.actor_user', { id: event.actor_user_id })
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
