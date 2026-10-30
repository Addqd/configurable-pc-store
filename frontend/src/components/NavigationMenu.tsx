import { FiHome, FiBox, FiCpu, FiMonitor, FiHeadphones, FiWind, FiServer, FiSettings, FiTag, FiHelpCircle, FiInfo } from 'react-icons/fi'
import { HiMiniChevronRight } from 'react-icons/hi2'
import { Link } from 'react-router'

interface NavItem {
  label: string
  icon: React.ComponentType<{ className?: string }>
  href: string
}

const MENU_ITEMS: NavItem[] = [
  { label: 'Главная', icon: FiHome, href: '/' },
  { label: 'Готовые сборки', icon: FiBox, href: '/catalog?category=prebuilt' },
  { label: 'Комплектующие', icon: FiCpu, href: '/catalog?category=components' },
  { label: 'Периферия', icon: FiMonitor, href: '/catalog?category=peripheral' },
  { label: 'Аксессуары', icon: FiHeadphones, href: '/catalog?category=accessories' },
  { label: 'Охлаждение', icon: FiWind, href: '/catalog?category=cooling' },
  { label: 'Сетевое оборудование', icon: FiServer, href: '/catalog?category=network' },
  { label: 'Софт и сервисы', icon: FiSettings, href: '/catalog?category=software' },
  { label: 'Акции', icon: FiTag, href: '/catalog?category=sale' },
  { label: 'Помощь', icon: FiHelpCircle, href: '/account' },
  { label: 'О нас', icon: FiInfo, href: '/account' },
]

const SEPARATOR_INDEX = 8

interface NavigationMenuProps {
  onClose: () => void
}

export function NavigationMenu({ onClose }: NavigationMenuProps) {
  return (
    <div className="absolute top-full left-0 right-0 sm:left-4 sm:right-auto sm:w-[280px] w-[calc(100%-2rem)] bg-surface rounded-xl border border-border shadow-[0_8px_30px_var(--color-shadow-md)] z-50 py-2 animate-in fade-in slide-in-from-top-2 duration-150">
      {MENU_ITEMS.map((item, index) => (
        <div key={item.label}>
          {index === SEPARATOR_INDEX && <div className="mx-4 my-1 border-t border-border" />}
          <Link
            to={item.href}
            className="flex items-center gap-3 px-4 py-2.5 text-sm text-text-primary hover:bg-primary-light hover:text-primary rounded-lg transition-colors"
            onClick={onClose}
          >
            <item.icon className="w-5 h-5 shrink-0 text-text-muted" />
            <span className="flex-1">{item.label}</span>
            <HiMiniChevronRight className="w-4 h-4 text-text-muted" />
          </Link>
        </div>
      ))}
    </div>
  )
}
