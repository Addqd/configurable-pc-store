import { useState } from 'react'
import { FiShoppingCart, FiPhone, FiFileText } from 'react-icons/fi'
import { HiMiniCube, HiMiniChevronRight } from 'react-icons/hi2'
import { SiTelegram, SiVk, SiYoutube, SiGmail } from 'react-icons/si'
import logo from '../assets/home/logo-pc-builder.png'

interface FooterLink {
  label: string
  href: string
}

interface FooterColumn {
  title: string
  icon: React.ComponentType<{ className?: string }>
  links: FooterLink[]
}

// Use HiMiniCube for Shop, FiShoppingCart for Customers, FiPhone for Contacts, FiFileText for Documents

const COLUMNS: FooterColumn[] = [
  {
    title: 'Магазин',
    icon: HiMiniCube,
    links: [
      { label: 'Каталог товаров', href: '/catalog' },
      { label: 'Готовые сборки', href: '/catalog?category=prebuilt' },
      { label: 'Конфигуратор ПК', href: '/builder' },
      { label: 'О нас', href: '#about' },
    ],
  },
  {
    title: 'Покупателям',
    icon: FiShoppingCart,
    links: [
      { label: 'Доставка и оплата', href: '#delivery' },
      { label: 'Гарантия и возврат', href: '#warranty' },
      { label: 'Частые вопросы (FAQ)', href: '#faq' },
    ],
  },
  {
    title: 'Контакты',
    icon: FiPhone,
    links: [
      { label: 'Электронная почта', href: 'mailto:info@pcbuilder.example' },
      { label: 'Телефон', href: 'tel:+78001234567' },
      { label: 'Telegram', href: 'https://t.example/pcbuilder' },
      { label: 'Форма обратной связи', href: '#contact-form' },
    ],
  },
  {
    title: 'Документы',
    icon: FiFileText,
    links: [
      { label: 'Политика конфиденциальности', href: '#privacy' },
      { label: 'Пользовательское соглашение', href: '#terms' },
      { label: 'Публичная оферта', href: '#offer' },
      { label: 'Обработка персональных данных', href: '#personal-data' },
    ],
  },
]

export function Footer() {
  const [showToast, setShowToast] = useState(false)

  const handleContactClick = (href: string) => {
    // If it's a real href (mailto, tel, https), let it work
    if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('http')) return
    // Otherwise show demo toast
    setShowToast(true)
    setTimeout(() => setShowToast(false), 3000)
  }

  return (
    <footer className="mt-12 pb-8">
      <div className="max-w-[1320px] mx-auto px-4">
        <div className="bg-surface rounded-2xl border border-border shadow-sm p-8">
          {/* Columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <div className="flex items-center gap-2 mb-4">
                  <col.icon className="w-5 h-5 text-primary" />
                  <h3 className="text-base font-bold text-text-primary">{col.title}</h3>
                </div>
                <ul className="space-y-3">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        onClick={(e) => {
                          if (col.title === 'Контакты' && !(link.href.startsWith('mailto:') || link.href.startsWith('tel:') || link.href.startsWith('http'))) {
                            e.preventDefault()
                            handleContactClick(link.href)
                          }
                        }}
                        className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-primary transition-colors group"
                      >
                        {link.label}
                        <HiMiniChevronRight className="w-3.5 h-3.5 text-text-muted group-hover:text-primary transition-colors opacity-0 group-hover:opacity-100" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Separator */}
          <div className="border-t border-border" />

          {/* Bottom bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6">
            <div className="flex items-center gap-4">
              <img src={logo} alt="PC Builder" className="h-8 w-auto" />
              <span className="text-sm text-text-secondary hidden sm:inline">
                Комплектующие. Сборки. Конфигуратор.
              </span>
            </div>

            <span className="text-sm text-text-muted">
              © 2026 PC Builder. Все права защищены.
            </span>

            <div className="flex items-center gap-3">
              <a
                href="https://t.example/pcbuilder"
                className="w-9 h-9 flex items-center justify-center rounded-lg bg-surface-3 hover:bg-primary-light text-text-muted hover:text-primary transition-colors"
                aria-label="Telegram"
              >
                <SiTelegram className="w-5 h-5" />
              </a>
              <a
                href="#"
                className="w-9 h-9 flex items-center justify-center rounded-lg bg-surface-3 hover:bg-primary-light text-text-muted hover:text-primary transition-colors"
                aria-label="VK"
              >
                <SiVk className="w-5 h-5" />
              </a>
              <a
                href="https://youtube.com/example"
                className="w-9 h-9 flex items-center justify-center rounded-lg bg-surface-3 hover:bg-primary-light text-text-muted hover:text-primary transition-colors"
                aria-label="YouTube"
              >
                <SiYoutube className="w-5 h-5" />
              </a>
              <a
                href="mailto:info@pcbuilder.example"
                className="w-9 h-9 flex items-center justify-center rounded-lg bg-surface-3 hover:bg-primary-light text-text-muted hover:text-primary transition-colors"
                aria-label="Email"
              >
                <SiGmail className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>

        {/* Demo toast */}
        {showToast && (
          <div className="fixed bottom-4 right-4 bg-surface border border-border rounded-lg shadow-lg px-4 py-3 text-sm text-text-secondary z-50 animate-in fade-in slide-in-from-bottom-2">
            Авторизация ещё не реализована
          </div>
        )}
      </div>
    </footer>
  )
}
