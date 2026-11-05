import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FiShoppingCart, FiPhone, FiFileText } from 'react-icons/fi'
import { HiMiniCube, HiMiniChevronRight } from 'react-icons/hi2'
import { SiTelegram, SiVk, SiYoutube, SiGmail } from 'react-icons/si'
import logo from '../assets/home/logo-pc-builder.png'

interface FooterLink {
  labelKey: string
  href: string
}

interface FooterColumn {
  titleKey: string
  icon: React.ComponentType<{ className?: string }>
  links: FooterLink[]
}

const COLUMNS: FooterColumn[] = [
  {
    titleKey: 'footer.shop',
    icon: HiMiniCube,
    links: [
      { labelKey: 'footer.catalog', href: '/catalog' },
      { labelKey: 'footer.prebuilts', href: '/catalog?category=prebuilt' },
      { labelKey: 'footer.configurator', href: '/builder' },
      { labelKey: 'footer.about_link', href: '#about' },
    ],
  },
  {
    titleKey: 'footer.customers',
    icon: FiShoppingCart,
    links: [
      { labelKey: 'footer.delivery', href: '#delivery' },
      { labelKey: 'footer.warranty', href: '#warranty' },
      { labelKey: 'footer.faq', href: '#faq' },
    ],
  },
  {
    titleKey: 'footer.contacts',
    icon: FiPhone,
    links: [
      { labelKey: 'footer.email', href: 'mailto:info@pcbuilder.example' },
      { labelKey: 'footer.phone', href: 'tel:+78001234567' },
      { labelKey: 'footer.telegram', href: 'https://t.example/pcbuilder' },
      { labelKey: 'footer.contact_form', href: '#contact-form' },
    ],
  },
  {
    titleKey: 'footer.documents',
    icon: FiFileText,
    links: [
      { labelKey: 'footer.privacy', href: '#privacy' },
      { labelKey: 'footer.terms', href: '#terms' },
      { labelKey: 'footer.offer', href: '#offer' },
      { labelKey: 'footer.personal_data', href: '#personal-data' },
    ],
  },
]

export function Footer() {
  const { t } = useTranslation()
  const [showToast, setShowToast] = useState(false)

  const handleContactClick = (href: string) => {
    if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('http')) return
    setShowToast(true)
    setTimeout(() => setShowToast(false), 3000)
  }

  return (
    <footer className="mt-12 pb-8">
      <div className="max-w-[1320px] mx-auto px-4">
        <div className="bg-surface rounded-2xl border border-border shadow-sm p-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
            {COLUMNS.map((col, index) => (
              <div key={col.titleKey} className={index < COLUMNS.length - 1 ? 'pc-footer-divider' : ''}>
                <div className="flex items-center gap-2 mb-4">
                  <col.icon className="w-5 h-5 text-primary" />
                  <h3 className="text-base font-bold text-text-primary">{t(col.titleKey)}</h3>
                </div>
                <ul className="space-y-3">
                  {col.links.map((link) => (
                    <li key={link.labelKey}>
                      <a
                        href={link.href}
                        onClick={(e) => {
                          if (col.titleKey === 'footer.contacts' && !(link.href.startsWith('mailto:') || link.href.startsWith('tel:') || link.href.startsWith('http'))) {
                            e.preventDefault()
                            handleContactClick(link.href)
                          }
                        }}
                        className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-primary transition-colors group"
                      >
                        {t(link.labelKey)}
                        <HiMiniChevronRight className="w-3.5 h-3.5 text-text-muted group-hover:text-primary transition-colors opacity-0 group-hover:opacity-100" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="border-t border-border" />
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6">
            <div className="flex items-center gap-4">
              <img src={logo} alt="PC Builder" className="h-8 w-auto" />
              <span className="text-sm text-text-secondary hidden sm:inline">
                {t('footer.tagline')}
              </span>
            </div>
            <span className="text-sm text-text-muted">
              {t('footer.copyright')}
            </span>
            <div className="flex items-center gap-3">
              <a href="https://t.example/pcbuilder" className="w-9 h-9 flex items-center justify-center rounded-lg bg-surface-3 hover:bg-primary-light text-text-muted hover:text-primary transition-colors" aria-label="Telegram">
                <SiTelegram className="w-5 h-5" />
              </a>
              <a href="#" className="w-9 h-9 flex items-center justify-center rounded-lg bg-surface-3 hover:bg-primary-light text-text-muted hover:text-primary transition-colors" aria-label="VK">
                <SiVk className="w-5 h-5" />
              </a>
              <a href="https://youtube.com/example" className="w-9 h-9 flex items-center justify-center rounded-lg bg-surface-3 hover:bg-primary-light text-text-muted hover:text-primary transition-colors" aria-label="YouTube">
                <SiYoutube className="w-5 h-5" />
              </a>
              <a href="mailto:info@pcbuilder.example" className="w-9 h-9 flex items-center justify-center rounded-lg bg-surface-3 hover:bg-primary-light text-text-muted hover:text-primary transition-colors" aria-label="Email">
                <SiGmail className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>
        {showToast && (
          <div className="fixed bottom-4 right-4 bg-surface border border-border rounded-lg shadow-lg px-4 py-3 text-sm text-text-secondary z-50 animate-in fade-in slide-in-from-bottom-2">
            {t('footer.contact_notif')}
          </div>
        )}
      </div>
    </footer>
  )
}
