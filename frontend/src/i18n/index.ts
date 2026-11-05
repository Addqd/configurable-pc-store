import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ru from './locales/ru.json'
import en from './locales/en.json'
import ruAdditions from './locales/ru.additions.json'
import enAdditions from './locales/en.additions.json'

const LANG_KEY = 'pc-builder-lang'
type I18nTree = Record<string, unknown>
function combine(base: I18nTree, additions: I18nTree): I18nTree {
  const result: I18nTree = { ...base }
  for (const [key, value] of Object.entries(additions)) {
    const previous = result[key]
    result[key] = value && typeof value === 'object' && !Array.isArray(value) &&
      previous && typeof previous === 'object' && !Array.isArray(previous)
      ? combine(previous as I18nTree, value as I18nTree)
      : value
  }
  return result
}
function savedLanguage(): 'ru' | 'en' | undefined {
  try {
    const lang = localStorage.getItem(LANG_KEY)
    return lang === 'ru' || lang === 'en' ? lang : undefined
  } catch { return undefined }
}

i18n.use(initReactI18next).init({
  lng: savedLanguage() ?? 'ru', fallbackLng: 'ru', supportedLngs: ['ru', 'en'],
  resources: {
    ru: { translation: combine(ru, ruAdditions) },
    en: { translation: combine(en, enAdditions) },
  },
  interpolation: { escapeValue: false }, react: { useSuspense: false },
})
export function saveLanguage(lang: string): void {
  if (lang !== 'ru' && lang !== 'en') return
  try { localStorage.setItem(LANG_KEY, lang) } catch { /* unavailable */ }
}
export function getLanguage(): string { return i18n.language || 'ru' }
export { i18n }
export default i18n
