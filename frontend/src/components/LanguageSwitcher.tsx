import { useRef, useEffect, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { saveLanguage } from '../i18n'
import rusFlag from '../../assets/rus-flag.png'
import engFlag from '../../assets/eng-flag.png'
import { FiChevronDown } from 'react-icons/fi'

type Lang = 'ru' | 'en'

interface LanguageSwitcherProps {
  className?: string
}

export function LanguageSwitcher({ className = '' }: LanguageSwitcherProps) {
  const { t, i18n: i18nextInstance } = useTranslation()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const firstOptionRef = useRef<HTMLButtonElement>(null)
  const currentLang = i18nextInstance.language as Lang

  const options: { code: Lang; label: string; flag: string }[] = [
    { code: 'ru', label: t('lang_switcher.ru'), flag: rusFlag },
    { code: 'en', label: t('lang_switcher.en'), flag: engFlag },
  ]

  const changeLang = useCallback(
    (code: Lang) => {
      i18nextInstance.changeLanguage(code)
      saveLanguage(code)
      setOpen(false)
    },
    [i18nextInstance],
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        e.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
      } else if (e.key === 'ArrowDown' && open) {
        e.preventDefault()
        firstOptionRef.current?.focus()
      }
    },
    [open],
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target
      if (!(target instanceof Element)) return
      const panel = panelRef.current
      const trigger = triggerRef.current
      if ((panel && panel.contains(target)) || (trigger && trigger.contains(target))) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const current = options.find((o) => o.code === currentLang) ?? options[0]

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t('lang_switcher.label')}
        className={
          'inline-flex items-center gap-1.5 h-9 px-2 rounded-md border border-border bg-surface hover:bg-surface-3 text-sm font-medium text-text-primary transition-colors ' +
          className
        }
      >
        <img src={current.flag} alt="" className="w-5 h-[14px] object-cover rounded-sm shrink-0" />
        <span>{current.label}</span>
        <FiChevronDown
          className={`w-3.5 h-3.5 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          ref={panelRef}
          role="listbox"
          aria-label={t('lang_switcher.label')}
          className="absolute right-0 top-full mt-1 w-32 bg-surface border border-border rounded-lg shadow-[0_8px_30px_var(--color-shadow-md)] py-1 z-[200] overflow-hidden"
        >
          {options.map((opt) => (
            <button
              key={opt.code}
              role="option"
              aria-selected={opt.code === currentLang}
              onClick={() => changeLang(opt.code)}
              ref={opt.code === options[0].code ? firstOptionRef : undefined}
              className={
                'w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ' +
                (opt.code === currentLang
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-text-primary hover:bg-surface-3')
              }
            >
              <img src={opt.flag} alt="" className="w-5 h-[14px] object-cover rounded-sm shrink-0" />
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
