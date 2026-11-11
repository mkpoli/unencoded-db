import { describe, expect, test } from 'bun:test'
import { FORMATIONS, ROLES } from './composition'
import { formationFromLabel, formationLabel, roleFromLabel, roleLabel } from './composition-labels'
import { LOCALES } from './i18n'

describe('composition labels', () => {
  for (const locale of LOCALES) {
    test(`round-trips every standard role in ${locale}`, () => {
      for (const role of ROLES) expect(roleFromLabel(locale, roleLabel(locale, role))).toBe(role)
      expect(roleFromLabel(locale, 'semantic')).toBe('semantic')
      expect(roleFromLabel(locale, '亦聲')).toBe('亦聲')
    })

    test(`round-trips every standard formation in ${locale}`, () => {
      for (const formation of FORMATIONS) expect(formationFromLabel(locale, formationLabel(locale, formation))).toBe(formation)
      expect(formationFromLabel(locale, 'phonoSemantic')).toBe('phonoSemantic')
      expect(formationFromLabel(locale, '形聲兼會意')).toBe('形聲兼會意')
    })
  }

  test('keeps custom text and caps it by code point', () => {
    const custom = '亦'.repeat(50)
    expect(roleFromLabel('en', custom)).toBe('亦'.repeat(40))
    expect(formationFromLabel('en', custom)).toBe('亦'.repeat(40))
    expect([...roleFromLabel('en', '木'.repeat(39) + '𠀀')]).toHaveLength(40)
  })
})
