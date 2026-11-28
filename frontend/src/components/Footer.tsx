import { useTranslation } from 'react-i18next'
import { FiShoppingCart, FiPhone, FiFileText } from 'react-icons/fi'
import { HiMiniCube, HiMiniChevronRight } from 'react-icons/hi2'
import { SiTelegram, SiVk, SiYoutube, SiGmail, SiGithub } from 'react-icons/si'
import { Link } from 'react-router'
import lightLogo from '../assets/logo/pc builder logo.png'
import darkLogo from '../assets/logo/pc builder logo dark.png'
import { useThemeStore } from '../stores/themeStore'

interface FooterLink {
  labelKey: string
  /** Only the destinations that really navigate carry an `href`; the rest stay inert. */
  href?: string
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
      { labelKey: 'footer.about_link' },
    ],
  },
  {
    titleKey: 'footer.customers',
    icon: FiShoppingCart,
    links: [
      { labelKey: 'footer.delivery' },
      { labelKey: 'footer.warranty' },
      { labelKey: 'footer.faq' },
    ],
  },
  {
    titleKey: 'footer.contacts',
    icon: FiPhone,
    links: [
      { labelKey: 'footer.email' },
      { labelKey: 'footer.phone' },
      { labelKey: 'footer.telegram' },
      { labelKey: 'footer.contact_form' },
    ],
  },
  {
    titleKey: 'footer.documents',
    icon: FiFileText,
    links: [
      { labelKey: 'footer.privacy' },
      { labelKey: 'footer.terms' },
      { labelKey: 'footer.offer' },
      { labelKey: 'footer.personal_data' },
    ],
  },
]

/** Social profiles without a real destination stay inert until one is approved. */
const SOCIAL_LINKS = [
  { label: 'Telegram', icon: SiTelegram },
  { label: 'VK', icon: SiVk },
  { label: 'YouTube', icon: SiYoutube },
  { label: 'Email', icon: SiGmail },
]

const GITHUB_URL = 'https://github.com/Addqd/configurable-pc-store'

const COLUMN_ENTRY_CLASS =
  'inline-flex items-center gap-2 text-left text-sm text-text-secondary hover:text-primary transition-colors group cursor-pointer'
const SOCIAL_LINK_CLASS =
  'w-9 h-9 flex items-center justify-center rounded-lg bg-surface-3 hover:bg-primary-light text-text-muted hover:text-primary transition-colors cursor-pointer'

function EntryContent({ label }: { label: string }) {
  return (
    <>
      {label}
      <HiMiniChevronRight className="w-3.5 h-3.5 text-text-muted group-hover:text-primary transition-colors opacity-0 group-hover:opacity-100" />
    </>
  )
}

export function Footer() {
  const { t } = useTranslation()
  const isDark = useThemeStore((state) => state.isDark)

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
                      {link.href ? (
                        <Link to={link.href} className={COLUMN_ENTRY_CLASS}>
                          <EntryContent label={t(link.labelKey)} />
                        </Link>
                      ) : (
                        <button type="button" className={COLUMN_ENTRY_CLASS}>
                          <EntryContent label={t(link.labelKey)} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="border-t border-border" />
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-4 pt-6">
            <div className="flex items-center justify-center sm:justify-start">
              <img src={isDark ? darkLogo : lightLogo} alt="PC Builder" className="h-8 w-auto" />
            </div>
            <span className="text-sm text-text-muted text-center">
              {t('footer.copyright')}
            </span>
            <div className="flex items-center justify-center gap-3 sm:justify-end">
              {SOCIAL_LINKS.map(({ label, icon: Icon }) => (
                <button key={label} type="button" className={SOCIAL_LINK_CLASS} aria-label={label}>
                  <Icon className="w-5 h-5" />
                </button>
              ))}
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={SOCIAL_LINK_CLASS}
                aria-label="GitHub"
              >
                <SiGithub className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
