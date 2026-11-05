import { useTranslation } from 'react-i18next'
import { FiHome, FiBox, FiCpu, FiMonitor, FiHeadphones, FiWind, FiServer, FiSettings, FiTag, FiHelpCircle, FiInfo } from 'react-icons/fi'
import { HiMiniChevronRight } from 'react-icons/hi2'
import { Link } from 'react-router'
import type { ComponentType } from 'react'

interface NavItem { labelKey: string; icon: ComponentType<{ className?: string }>; href: string }
const MENU_ITEMS: NavItem[] = [
  { labelKey: 'header.nav.home', icon: FiHome, href: '/' },
  { labelKey: 'header.nav.prebuilt', icon: FiBox, href: '/catalog?category=prebuilt' },
  { labelKey: 'header.nav.components', icon: FiCpu, href: '/catalog?category=components' },
  { labelKey: 'header.nav.peripheral', icon: FiMonitor, href: '/catalog?category=peripheral' },
  { labelKey: 'header.nav.accessories', icon: FiHeadphones, href: '/catalog?category=accessories' },
  { labelKey: 'header.nav.cooling', icon: FiWind, href: '/catalog?category=cooling' },
  { labelKey: 'header.nav.network', icon: FiServer, href: '/catalog?category=network' },
  { labelKey: 'header.nav.software', icon: FiSettings, href: '/catalog?category=software' },
  { labelKey: 'header.nav.sale', icon: FiTag, href: '/catalog?category=sale' },
  { labelKey: 'header.nav.help', icon: FiHelpCircle, href: '/account' },
  { labelKey: 'header.nav.about', icon: FiInfo, href: '/account' },
]
const SEPARATOR_INDEX = 8
export function NavigationMenu({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  return <div className="w-[280px] max-w-[calc(100vw-16px)] bg-surface rounded-xl border border-border shadow-[0_8px_30px_var(--color-shadow-md)] py-2">
    {MENU_ITEMS.map((item,index) => <div key={item.labelKey}>
      {index === SEPARATOR_INDEX && <div className="mx-4 my-1 border-t border-border" />}
      <Link to={item.href} className="flex items-center gap-3 px-4 py-2.5 text-sm text-text-primary hover:bg-primary-light hover:text-primary rounded-lg transition-colors" onClick={onClose}>
        <item.icon className="w-5 h-5 shrink-0 text-text-muted" /><span className="flex-1">{t(item.labelKey)}</span><HiMiniChevronRight className="w-4 h-4 text-text-muted" />
      </Link>
    </div>)}
  </div>
}
