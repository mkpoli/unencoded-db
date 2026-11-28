import { expect, test } from 'bun:test'
import { IRG_REFERENCES, readiness, type SightingFacts } from './readiness'

test('running text among several contexts passes the running-text check', () => {
  const seen = (contexts: string | null): SightingFacts => ({ media: [], title: null, author: null, publisher: null, report_date: null, page: null, contexts, style: null })
  const running = (contexts: string | null) => readiness({ ids: null, radical: null, strokes: null }, [seen(contexts)]).running
  expect(running('["running_text","heading"]')).toBe(true)
  expect(running('["heading"]')).toBe(false)
  expect(running(null)).toBe(false)
})

test('IRG_REFERENCES lists P&P v18 alongside 2026 FS/SC and radical assignment guidelines', () => {
  expect(IRG_REFERENCES.map(ref => [ref.id, ref.doc, ref.href])).toEqual([
    ['pp', 'IRG N2850R', 'https://www.unicode.org/irg/pp/'],
    ['fssc', 'IRG N2951', 'https://www.unicode.org/irg/docs/n2951-FSSC.pdf'],
    ['radicals', 'IRG N2952', 'https://www.unicode.org/irg/docs/n2952-RadicalAssignments.pdf'],
  ])
})
