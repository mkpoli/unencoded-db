import { expect, test } from 'bun:test'
import { translate } from './i18n'
import { sourceByline, sourceHeading, sourceName } from './source-name'

const label = (key: string) => translate('en', key)
const named = (source: Parameters<typeof sourceName>[0]) => sourceName(source, label)

test('a source goes by its title, then what it appeared in, its link, its author or what else it states', () => {
  const message = { author: '甲（1000001）', container: '某討論羣（2000000）', publisher: 'QQ', report_date: '2026-11-14' }
  expect(named({ ...message, title: 'A book', url: 'https://example.org/a' })).toEqual({ text: 'A book', fields: ['title'] })
  expect(named({ ...message, url: 'https://example.org/a' })).toEqual({ text: '某討論羣（2000000）', fields: ['container'] })
  expect(named({ author: '@account', publisher: 'X', url: 'https://example.org/a' })).toEqual({ text: 'https://example.org/a', fields: ['url'] })
  expect(named({ author: '甲', publisher: 'QQ' })).toEqual({ text: '甲', fields: ['author'] })
  expect(named({ author: '甲', source_kind: 'personal', publisher: 'QQ' })).toEqual({ text: '甲 · Personal communication', fields: ['author', 'source_kind'] })
  expect(named({ source_kind: 'personal', report_date: '2026' })).toEqual({ text: 'Personal communication', fields: ['source_kind'] })
  expect(named({ publisher: 'A site', report_date: '2026' })).toEqual({ text: 'A site', fields: ['publisher'] })
  // A date is no name; it stands beside the name with its reading.
  expect(named({ report_date: '2026', source_kind: 'unknown' })).toEqual({ text: 'Source', fields: [] })
  expect(named({ title: '', author: null })).toEqual({ text: 'Source', fields: [] })
})

test('standing alone, a message is named with its author, and the line beside a name repeats none of it', () => {
  const message = { author: '甲', container: '某討論羣', publisher: 'QQ' }
  expect(sourceHeading(message, label)).toBe('甲 · 某討論羣')
  expect(sourceHeading({ container: '某討論羣' }, label)).toBe('某討論羣')
  expect(sourceHeading({ ...message, title: 'A book' }, label)).toBe('A book')
  const line = (source: Parameters<typeof sourceName>[0]) => sourceByline(source, named(source).fields, label, ['author', 'container', 'source_kind', 'publisher'])
  expect(line(message)).toBe('甲 · QQ')
  expect(line({ ...message, title: 'A book' })).toBe('甲 · 某討論羣 · QQ')
  expect(line({ author: '甲', source_kind: 'personal', publisher: 'QQ' })).toBe('QQ')
  expect(line({ publisher: 'A site' })).toBe('')
})
