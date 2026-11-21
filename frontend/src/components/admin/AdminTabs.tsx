import { useRef, type KeyboardEvent } from 'react'
import type { IconType } from 'react-icons'
import { Link } from 'react-router'
import { adminTabId, adminTabPanelId } from './adminTabIds'

export interface AdminTab {
  key: string
  label: string
  icon: IconType
  /** Route target; required when the strip navigates between pages. */
  to: string
}

interface AdminTabsProps {
  tabs: readonly [AdminTab, AdminTab]
  activeKey: string
  label: string
  /**
   * `navigation` renders real links between separate pages (products/users).
   * `tabs` (default) renders an in-page ARIA tablist (analytics, product form).
   */
  variant?: 'tabs' | 'navigation'
  /** Activates an in-page tab. Ignored by the navigation variant. */
  onSelect?: (tab: AdminTab) => void
  /** Stable DOM id prefix for tab/tabpanel wiring; required by the tabs variant. */
  idPrefix?: string
}

const itemClass = (active: boolean) =>
  `relative -mb-px flex items-center justify-center gap-2.5 border-b-[3px] px-3 py-4 text-base font-medium transition-colors ${
    active ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'
  }`

/**
 * The two-column tab strip used by the admin panel, product edit and analytics.
 *
 * Separate routes are plain links (so open-in-new-tab, middle click and the
 * browser history keep working); genuine same-page tabs use the ARIA tab
 * pattern with roving `tabIndex` and arrow-key navigation.
 */
export function AdminTabs({
  tabs,
  activeKey,
  label,
  variant = 'tabs',
  onSelect,
  idPrefix = 'admin-tabs',
}: AdminTabsProps) {
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([])

  if (variant === 'navigation') {
    return (
      <nav aria-label={label} className="grid grid-cols-2 border-b border-border">
        {tabs.map((tab) => {
          const active = tab.key === activeKey
          return (
            <Link
              key={tab.key}
              to={tab.to}
              aria-current={active ? 'page' : undefined}
              className={itemClass(active)}
            >
              <tab.icon className="h-5 w-5" aria-hidden="true" />
              {tab.label}
            </Link>
          )
        })}
      </nav>
    )
  }

  const activate = (index: number) => {
    const tab = tabs[index]
    if (!tab) return
    onSelect?.(tab)
    buttonsRef.current[index]?.focus()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length
    else if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = tabs.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    activate(nextIndex)
  }

  return (
    <div role="tablist" aria-label={label} className="grid grid-cols-2 border-b border-border">
      {tabs.map((tab, index) => {
        const active = tab.key === activeKey
        return (
          <button
            key={tab.key}
            ref={(element) => { buttonsRef.current[index] = element }}
            type="button"
            role="tab"
            id={adminTabId(idPrefix, tab.key)}
            aria-selected={active}
            aria-controls={adminTabPanelId(idPrefix, tab.key)}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect?.(tab)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={itemClass(active)}
          >
            <tab.icon className="h-5 w-5" aria-hidden="true" />
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
