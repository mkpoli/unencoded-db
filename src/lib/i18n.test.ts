import { expect, test } from 'bun:test'
import { catalogues, LOCALES } from './i18n'

const placeholders = (value: string) => (value.match(/\{\w+\}/g) ?? []).sort()

const names = {
  en: 'Rare Character Compendium',
  ja: '珍字集覧',
  'zh-Hans': '珍字集览',
  'zh-Hant': '珍字集覽',
  ko: '진자집람',
  vi: 'Tuyển tập chữ quý',
}

test('each locale uses its product name in the about page', () => {
  for (const locale of LOCALES) {
    const catalogue = catalogues[locale]
    expect(catalogue['app.name']).toBe(names[locale])
    expect(catalogue['about.title']).toContain(names[locale])
    expect(catalogue['about.what']).toContain(names[locale])
    expect(catalogue['app.description']).toContain('Glyph Atlas')
    expect(catalogue['app.description']).toContain('IRG')
  }
})

test('every locale contains the same messages and placeholders', () => {
  const source = catalogues.en
  const keys = Object.keys(source).sort()
  for (const locale of LOCALES) {
    const catalogue = catalogues[locale]
    expect(Object.keys(catalogue).sort()).toEqual(keys)
    for (const key of keys) expect(placeholders(catalogue[key])).toEqual(placeholders(source[key]))
  }
})
