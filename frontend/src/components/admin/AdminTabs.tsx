import type { IconType } from 'react-icons'

export interface AdminTab {
  key: string
  label: string
  icon: IconType
  to: string
}

interface AdminTabsProps {
  tabs: readonly [AdminTab, AdminTab]
  activeKey: string
  onSelect: (tab: AdminTab) => void
  label: string
}

/** The two-column tab strip used by the admin panel, product edit and analytics. */
export function AdminTabs({ tabs, activeKey, onSelect, label }: AdminTabsProps) {
  return (
    <div role="tablist" aria-label={label} className="grid grid-cols-2 border-b border-border">
      {tabs.map((tab) => {
        const active = tab.key === activeKey
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(tab)}
            className={`relative -mb-px flex items-center justify-center gap-2.5 border-b-[3px] px-3 py-4 text-base font-medium transition-colors ${
              active
                ? 'border-primary text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            <tab.icon className="h-5 w-5" aria-hidden="true" />
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
