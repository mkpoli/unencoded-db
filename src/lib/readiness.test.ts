import { expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { IRG_REFERENCES, readiness, type SightingFacts } from './readiness'

test('running text among several contexts passes the running-text check', () => {
  const seen = (contexts: string | null): SightingFacts => ({ media: [], title: null, author: null, publisher: null, report_date: null, page: null, contexts, style: null })
  const running = (contexts: string | null) => readiness({ ids: null, radical: null, strokes: null }, [seen(contexts)]).running
  expect(running('["running_text","heading"]')).toBe(true)
  expect(running('["heading"]')).toBe(false)
  expect(running(null)).toBe(false)
})

test('every IRG reference uses a unicode.org/irg URL and has a localized label in every message catalogue', () => {
  const files = readdirSync('messages').filter(name => name.endsWith('.json'))
  expect(files.length).toBeGreaterThanOrEqual(6)
  for (const ref of IRG_REFERENCES) {
    expect(ref.href.startsWith('https://www.unicode.org/irg/')).toBe(true)
    for (const file of files) {
      const catalogue = JSON.parse(readFileSync(`messages/${file}`, 'utf8')) as Record<string, string>
      expect(typeof catalogue[ref.labelKey]).toBe('string')
      expect(catalogue[ref.labelKey].trim().length).toBeGreaterThan(0)
    }
  }
})
