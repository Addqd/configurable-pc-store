import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ru from './locales/ru.json'
import en from './locales/en.json'

const LANG_KEY = 'pc-builder-lang'

function getSavedLang(): string | undefined {
  try {
    return localStorage.getItem(LANG_KEY) || undefined
  } catch {
    return undefined
  }
}

i18n
  .use(initReactI18next)
  .init({
    lng: getSavedLang() || 'ru',
    fallbackLng: 'en',
    supportedLngs: ['ru', 'en'],
    defaultNS: 'translation',
    ns: ['translation'],
    resources: {
      ru: { translation: ru },
      en: { translation: en },
    },
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  })

export function saveLanguage(lang: string): void {
  try {
    localStorage.setItem(LANG_KEY, lang)
  } catch {
    /* storage full or unavailable */
  }
}

export function getLanguage(): string {
  return i18n.language || 'ru'
}

export { i18n }
export default i18n
