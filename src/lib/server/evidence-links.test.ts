import { describe, expect, test } from 'bun:test'
import { readEvidenceFields } from './evidence-links'

function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [name, value] of Object.entries(values)) data.set(name, value)
  return data
}

describe('evidence links', () => {
  test('drop the share tracking from an X post link', () => {
    const row = readEvidenceFields(form({ place: 'Post', url: 'https://x.com/mkpoli/status/2119010548327334386?a=d47PdKKaof_S9ZTqrxU&s=20' }))
    expect(row?.url).toBe('https://x.com/mkpoli/status/2119010548327334386')
  })

  test('keep a link from another site as written', () => {
    const row = readEvidenceFields(form({ place: 'Book', url: 'https://example.org/source?a=1&s=20' }))
    expect(row?.url).toBe('https://example.org/source?a=1&s=20')
  })
})
