import i18n from './index'

export function localeDate(timestamp: number): string {
  return new Intl.DateTimeFormat(i18n.resolvedLanguage === 'en' ? 'en-GB' : 'ru-RU').format(new Date(timestamp))
}

export function relativeSavedDate(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return i18n.t('saves.date_unknown')
  const days = Math.floor((Date.now() - timestamp) / 86400000)
  if (days === 0) return i18n.t('saves.today')
  if (days === 1) return i18n.t('saves.yesterday')
  if (days >= 2 && days <= 6) return i18n.t('saves.days_ago', { count: days })
  return localeDate(timestamp)
}

export function knownError(message: string): string {
  const key = ({
    'Введите корректный email': 'auth.validation_email',
    'Email или имя пользователя уже заняты': 'auth.identifier_taken',
    'Неверный email/имя пользователя или пароль': 'auth.invalid_credentials',
    'Минимум 2 символа': 'auth.validation_username_min',
    'Минимум 8 символов': 'auth.validation_password_min',
    'Пароли не совпадают': 'auth.validation_passwords_match',
    'Действие отменено: состояние входа изменилось': 'auth.session_changed',
    'Имя пользователя должно содержать минимум 2 символа': 'auth.validation_username_min',
    'Имя должно содержать минимум 2 символа': 'account.name_min',
    'Пароль должен содержать минимум 8 символов': 'auth.validation_password_min',
    'Не удалось создать аккаунт. Проверьте доступность защищённого контекста браузера.': 'auth.create_failed',
    'Введите логин и пароль': 'auth.validation_check_data',
    'Нет активной сессии': 'auth.no_session',
    'Новый пароль должен содержать минимум 8 символов': 'account.new_password_min',
    'Неверный текущий пароль': 'account.invalid_current_password',
    'Сессия изменилась': 'auth.session_changed',
    'Не удалось изменить пароль': 'account.password_change_error',
    'Можно загрузить только JPG, PNG или WebP': 'account.avatar_error_type',
    'Изображение должно быть меньше 5 МБ': 'account.avatar_error_size',
    'Файл изображения повреждён': 'account.avatar_error_corrupt',
    'Невозможно обработать изображение': 'account.avatar_error_process',
  } as Record<string, string>)[message]
  return key ? i18n.t(key) : message
}
