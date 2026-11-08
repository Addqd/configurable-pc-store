import type { TFunction } from 'i18next'
import type { CompatibilityStatus } from '../api/generated/model'
import { BUILDER_CATEGORIES, type BuilderCategory } from '../stores/builderStore'

export function compatibilityMessage(item: CompatibilityStatus, t: TFunction): string {
  const component = BUILDER_CATEGORIES.find(slot => slot === item.slot)
  if (component) {
    const label = t(`builder.components.${component}`)
    return item.product_id === 0
      ? t('builder.diagnostics.missing', { component: label })
      : t('builder.diagnostics.invalid_product', { component: label })
  }
  const check = t(`builder.diagnostics.checks.${item.slot.replace('+', '_')}`, { defaultValue: t('builder.diagnostics.checks.other') })
  return t(item.status === 'incompatible' ? 'builder.diagnostics.incompatible' : 'builder.diagnostics.unknown', { check })
}

export function checkTouchesComponent(slot: string, category: BuilderCategory): boolean {
  return slot.split('+').some(part => part === category || part.startsWith(`${category}_`))
}
