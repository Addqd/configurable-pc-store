import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import i18n from '../i18n'
import { LanguageSwitcher } from './LanguageSwitcher'

afterEach(async () => { cleanup(); await i18n.changeLanguage('ru'); localStorage.removeItem('pc-builder-lang') })

describe('LanguageSwitcher RUS/ENG', () => {
  it('opens exactly the two existing options', async () => {
    await i18n.changeLanguage('ru')
    render(<LanguageSwitcher />)
    fireEvent.click(screen.getByRole('button', { name: /язык|language/i }))
    const choices = screen.getAllByRole('menuitemradio')
    expect(choices).toHaveLength(2)
    expect(choices.map((choice) => choice.textContent)).toEqual(['RUS', 'ENG'])
    expect(choices.map((choice) => choice.getAttribute('aria-checked'))).toEqual([
      'true',
      'false',
    ])
  })

  it('keeps the narrow panel anchored to the trigger right edge', async () => {
    await i18n.changeLanguage('ru')
    render(<LanguageSwitcher />)
    fireEvent.click(screen.getByRole('button', { name: /язык|language/i }))
    const panel = screen.getByRole('menu')
    // Nominal 96px panel, still right-aligned and 4px below the trigger.
    expect(panel.className).toContain('w-24')
    expect(panel.className).toContain('right-0')
    expect(panel.className).toContain('top-full')
    expect(panel.className).toContain('mt-1')
    expect(panel.className).not.toContain('w-32')
  })

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
