import * as matchers from '@testing-library/jest-dom/matchers'
import { expect } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { createElement } from 'react'
import i18n from './i18n'

expect.extend(matchers)

const _originalRender = global.render
if (_originalRender) {
  global.render = function wrappedRender(ui, options) {
    if (!options) options = {}
    if (!options.wrapper) {
      options.wrapper = function I18nWrapper({ children }: { children: React.ReactNode }) {
        return createElement(I18nextProvider, { i18n }, children)
      }
    }
    return _originalRender(ui, options)
  }
}
