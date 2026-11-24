import type { TFunction } from 'i18next'
import type { CompatibilityStatus } from '../api/generated/model'
import { BUILDER_CATEGORIES, type BuilderCategory } from '../stores/builderStore'
import { characteristicLabel, characteristicValue } from '../i18n/characteristics'

/** i18n key suffix of a check id, e.g. `cpu+mobo_socket` → `cpu_mobo_socket`. */
function checkKey(slot: string): string {
  return slot.replace('+', '_')
}

/** Localized name of one compatibility check. */
export function compatibilityCheckName(slot: string, t: TFunction): string {
  return t(`builder.diagnostics.checks.${checkKey(slot)}`, { defaultValue: t('builder.diagnostics.checks.other') })
}

/** Whether a check id involves the given configurator category. */
export function checkTouchesComponent(slot: string, category: BuilderCategory): boolean {
  return slot.split('+').some(part => part === category || part.startsWith(`${category}_`))
}

/** One localized row of a conflict: component, product, characteristic, value. */
export interface ConflictRow {
  component: string
  product: string
  characteristic: string
  value: string
}

/**
 * Structured evidence of one check, localized from the server fields.
 *
 * The client never parses `message` and never guesses which components conflict:
 * the component, the product, the characteristic and its value come from the
 * server evidence, and only the labels and units are localized here.
 */
export function conflictRows(item: CompatibilityStatus, t: TFunction, language: string): ConflictRow[] {
  return (item.details ?? []).map(evidence => {
    const component = BUILDER_CATEGORIES.find(slot => slot === evidence.slot)
    const row = { code: evidence.code, name: evidence.name, data_type: evidence.data_type, unit: evidence.unit, value: evidence.value, display_value: evidence.display_value }
    const value = characteristicValue(row, language).trim()
    return {
      component: component ? t(`builder.components.${component}`) : evidence.slot,
      product: evidence.product_name,
      characteristic: characteristicLabel(row, language),
      value: value || t('builder.diagnostics.no_value'),
    }
  })
}

/** Localized explanation of why a check exists, e.g. "sockets must be identical". */
export function compatibilityExplanation(slot: string, t: TFunction): string {
  return t(`builder.diagnostics.explanations.${checkKey(slot)}`, { defaultValue: t('builder.diagnostics.explanations.other') })
}

/**
 * Short, localized summary of one diagnostic row.
 *
 * Slot-level rows (a wrong or missing part) are named by component; rule rows are
 * named by the check they represent, so the summary never repeats server English.
 */
export function compatibilityMessage(item: CompatibilityStatus, t: TFunction): string {
  const component = BUILDER_CATEGORIES.find(slot => slot === item.slot)
  if (component) {
    const label = t(`builder.components.${component}`)
    return item.product_id === 0
      ? t('builder.diagnostics.missing', { component: label })
      : t('builder.diagnostics.invalid_product', { component: label })
  }
  const check = compatibilityCheckName(item.slot, t)
  return t(item.status === 'incompatible' ? 'builder.diagnostics.incompatible' : 'builder.diagnostics.unknown', { check })
}
