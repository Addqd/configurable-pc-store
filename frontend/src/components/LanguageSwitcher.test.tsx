import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import i18n from '../i18n'
import { LanguageSwitcher } from './LanguageSwitcher'

afterEach(async () => { cleanup(); await i18n.changeLanguage('ru'); localStorage.removeItem('pc-builder-lang') })

describe('LanguageSwitcher RUS/ENG', () => {
  it('opens the two vertical options and persists selection without reload', async () => {
    await i18n.changeLanguage('ru')
    render(<LanguageSwitcher />)
    const toggle = screen.getByRole('button', { name: /язык|language/i })
    fireEvent.click(toggle)
    const choices = screen.getAllByRole('menuitemradio')
    expect(choices).toHaveLength(2)
    fireEvent.click(choices[1])
    expect(i18n.language).toBe('en')
    expect(localStorage.getItem('pc-builder-lang')).toBe('en')
    expect(screen.queryByRole('menuitemradio')).toBeNull()
  })

  it('closes with Escape and restores focus', async () => {
    await i18n.changeLanguage('ru')
    render(<LanguageSwitcher />)
    const toggle = screen.getByRole('button', { name: /язык|language/i })
    fireEvent.click(toggle)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menuitemradio')).toBeNull()
    expect(document.activeElement).toBe(toggle)
  })
})
