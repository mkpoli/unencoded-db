import { expect, test } from 'bun:test'
import { readiness, type SightingFacts } from './readiness'

test('running text among several contexts passes the running-text check', () => {
  const seen = (contexts: string | null): SightingFacts => ({ media: [], title: null, author: null, publisher: null, report_date: null, page: null, contexts, style: null })
  const running = (contexts: string | null) => readiness({ ids: null, radical: null, strokes: null }, [seen(contexts)]).running
  expect(running('["running_text","heading"]')).toBe(true)
  expect(running('["heading"]')).toBe(false)
  expect(running(null)).toBe(false)
})
