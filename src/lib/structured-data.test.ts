import { expect, test } from 'bun:test'
import { jsonLdScript, machineDate, recordData, RECORD_LICENSE, sourceData } from './structured-data'

const source = { id: 7, title: '康熙字典', author: '張玉書', publisher: null, report_date: '1716', url: 'https://example.org/kx' }

test('only ISO dates are published as dates', () => {
  expect(machineDate('1716')).toBe('1716')
  expect(machineDate('1716-03-09')).toBe('1716-03-09')
  expect(machineDate('明萬曆34年')).toBeNull()
  expect(machineDate('1716-02-30')).toBeNull()
  expect(machineDate(null)).toBeNull()
})

test('a record is a licensed work with its cited sources and a trail', () => {
  const [work, trail] = recordData({ locale: 'ja', id: 12, name: '⿰山東 · R-12', description: 'd', siteName: 'Site', image: '/media/v2/k.jpg', sources: [source, source, { id: 8, report_date: '明萬曆34年' }] }) as any[]
  expect(work['@type']).toBe('CreativeWork')
  expect(work['@id']).toBe('https://rare.glyphatlas.org/ja/entry/12')
  expect(work.image).toBe('https://rare.glyphatlas.org/media/v2/k.jpg')
  expect(work.license).toBe(RECORD_LICENSE)
  expect(work.inLanguage).toBe('ja')
  expect(work.isPartOf.url).toBe('https://rare.glyphatlas.org/')
  expect(work.citation).toEqual([
    { '@type': 'CreativeWork', name: '康熙字典', creator: '張玉書', datePublished: '1716', url: 'https://rare.glyphatlas.org/ja/source/7' },
    { '@type': 'CreativeWork', url: 'https://rare.glyphatlas.org/ja/source/8' },
  ])
  expect(trail.itemListElement.map((item: any) => item.item)).toEqual(['https://rare.glyphatlas.org/ja', 'https://rare.glyphatlas.org/ja/entry/12'])
})

test('a record without a picture or sources leaves those fields out', () => {
  const [work] = recordData({ locale: 'en', id: 1, name: 'n', description: 'd', siteName: 's', sources: [] }) as any[]
  expect('image' in work).toBe(false)
  expect('citation' in work).toBe(false)
})

test('a source keeps free-text dates out of datePublished', () => {
  const build = (report_date: string, url: string | null) => sourceData({ locale: 'en', source: { ...source, report_date, url }, name: 'n', siteName: 's', sourcesName: 'Sources' }) as any[]
  expect(build('1716', 'https://example.org/kx')[0]).toMatchObject({ datePublished: '1716', sameAs: 'https://example.org/kx', creator: '張玉書' })
  const [free, trail] = build('明萬曆34年', 'javascript:alert(1)')
  expect('datePublished' in free).toBe(false)
  expect('sameAs' in free).toBe(false)
  expect(trail.itemListElement.map((item: any) => item.item).at(1)).toBe('https://rare.glyphatlas.org/en/sources')
})

test('script text cannot close its element', () => {
  expect(jsonLdScript({ name: '</script><b>' })).not.toContain('</script><b>')
})
