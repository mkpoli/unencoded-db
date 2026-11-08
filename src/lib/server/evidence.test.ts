import { describe, expect, test } from 'bun:test'
import { invalidFields, readEvidence } from './evidence'

function form(values: Record<string, string>) { const f = new FormData(); for (const [k, v] of Object.entries(values)) f.set(k, v); return f }
describe('evidence', () => {
  test('trims fields and requires a place', () => {
    const result = readEvidence(form({ script: ' Han ', place: ' Book ' }))
    expect(result?.script).toBe('Han')
    expect(result?.place).toBe('Book')
  })
  test('requires script and place without a source URL', () => {
    expect(readEvidence(form({ place: 'book' }))).toBeNull()
    expect(readEvidence(form({ script: 'Han' }))).toBeNull()
    expect(readEvidence(form({ script: 'Han', place: '  ' }))).toBeNull()
    expect(readEvidence(form({ script: 'Han', place: 'book' }))).not.toBeNull()
  })
  test('ignores any submitted source URL field', () => {
    const result = readEvidence(form({ script: 'Han', place: 'book', url: 'javascript:alert(1)' }))
    expect(result).not.toBeNull()
    expect(result && 'url' in result).toBe(false)
  })
  test('rejects oversized fields', () => {
    expect(readEvidence(form({ script: 'Han', place: 'x'.repeat(501) }))).toBeNull()
    expect(readEvidence(form({ script: 'x'.repeat(81), place: 'book' }))).toBeNull()
  })
  test('names every failing field in one pass', () => {
    expect(invalidFields(form({ place: 'book' }))).toEqual(['script'])
    expect(invalidFields(form({ script: 'Han', place: 'book', title: 'x'.repeat(301), note: 'note' }))).toEqual(['title'])
    expect(invalidFields(form({ script: 'Han', place: 'x'.repeat(501) }))).toEqual(['place'])
    expect(invalidFields(form({ script: 'Han', place: 'book' }))).toEqual([])
  })
})
