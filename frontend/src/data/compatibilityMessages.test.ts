import { describe, expect, it } from 'vitest'
import { i18n } from '../i18n'
import { compatibilityMessage, checkTouchesComponent } from './compatibilityMessages'

describe('compatibility diagnostics', () => {
  it('identifies each missing part in both languages without using server text', () => {
    const cpu = { product_id: 0, product_name: '', slot: 'cpu', status: 'unknown' as const, message: 'Required component is missing' }
    const gpu = { ...cpu, slot: 'gpu' }
    expect(compatibilityMessage(cpu, i18n.getFixedT('ru'))).toContain('Процессор')
    expect(compatibilityMessage(gpu, i18n.getFixedT('ru'))).toContain('Видеокарта')
    expect(compatibilityMessage(cpu, i18n.getFixedT('en'))).toContain('Processor')
    expect(compatibilityMessage(cpu, i18n.getFixedT('en'))).not.toContain(cpu.message)
  })
  it('localizes distinct incompatible and unknown checks and attributes their components', () => {
    const item = { product_id: 0, product_name: '', slot: 'cpu+mobo_socket', status: 'incompatible' as const }
    expect(compatibilityMessage(item, i18n.getFixedT('ru'))).toContain('сокет процессора и платы')
    expect(compatibilityMessage({ ...item, status: 'unknown' }, i18n.getFixedT('en'))).toContain('Insufficient data')
    expect(checkTouchesComponent(item.slot, 'cpu')).toBe(true)
    expect(checkTouchesComponent(item.slot, 'mobo')).toBe(true)
    expect(checkTouchesComponent(item.slot, 'gpu')).toBe(false)
  })
})
