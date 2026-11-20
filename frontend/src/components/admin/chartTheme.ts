import type { CSSProperties } from 'react'

/**
 * Blue of every horizontal comparison bar. The approved design uses one colour
 * for all bars of a ranking instead of a different colour per rank.
 */
export const CHART_BAR_COLOR = '#2563eb'

/**
 * Tooltip chrome shared by the analytics charts. Colours are CSS variables of
 * the application design system, so the same component renders correctly in
 * both the light and the dark theme.
 */
export const tooltipContentStyle: CSSProperties = {
  backgroundColor: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 12,
  boxShadow: '0 12px 32px var(--color-shadow)',
  color: 'var(--color-text-primary)',
  fontSize: 12,
  padding: '8px 10px',
}

export const tooltipLabelStyle: CSSProperties = {
  color: 'var(--color-text-secondary)',
  fontSize: 11,
  marginBottom: 4,
}

export const tooltipItemStyle: CSSProperties = {
  color: 'var(--color-text-primary)',
  fontSize: 12,
  padding: 0,
}
