import { describe, expect, test } from 'bun:test'
import { readEvidence } from './evidence'

function form(values: Record<string, string>) { const f = new FormData(); for (const [k, v] of Object.entries(values)) f.set(k, v); return f }
describe('evidence', () => {
  test('trims fields and permits a link as the place', () => {
    const result = readEvidence(form({ script: ' Han ', url: ' https://example.org/source ' }))
    expect(result?.script).toBe('Han')
    expect(result?.place).toBe('https://example.org/source')
  })
  test('requires script and source URL even when place is supplied', () => {
    expect(readEvidence(form({ url: 'https://example.org/source' }))).toBeNull()
    expect(readEvidence(form({ script: 'Han', place: 'book' }))).toBeNull()
    expect(readEvidence(form({ script: 'Han', url: '  ' }))).toBeNull()
  })
  test('rejects unsafe or malformed links and oversized fields', () => {
    for (const url of ['javascript:alert(1)', 'https://user:pass@example.org', 'http://']) expect(readEvidence(form({ script: 'Han', place: 'book', url }))).toBeNull()
    expect(readEvidence(form({ script: 'Han', url: 'https://example.org', place: 'x'.repeat(501) }))).toBeNull()
  })
})
