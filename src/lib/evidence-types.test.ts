import { describe, expect, test } from 'bun:test'
import { EVIDENCE_TYPES, parseEvidenceTypes, readEvidenceTypes, serializeEvidenceTypes } from './evidence-types'

function form(...values: string[]) {
  const form = new FormData()
  for (const value of values) form.append('types', value)
  return form
}

describe('evidence types', () => {
  test('reads every selected type once, ignoring unknown values', () => {
    expect(readEvidenceTypes(form('reading', 'mention', 'mention', 'unknown'))).toEqual(['mention', 'reading'])
    expect(readEvidenceTypes(form())).toEqual([])
    expect(readEvidenceTypes(form('unknown'))).toEqual([])
    const fileForm = new FormData()
    fileForm.append('types', new Blob(['mention']))
    expect(readEvidenceTypes(fileForm)).toEqual([])
  })

  test('parses stored arrays in the form order and ignores malformed values', () => {
    expect(parseEvidenceTypes(JSON.stringify(['relation', 'attestation']))).toEqual(['attestation', 'relation'])
    expect(parseEvidenceTypes('[]')).toEqual([])
    expect(parseEvidenceTypes(null)).toEqual([])
    expect(parseEvidenceTypes('{}')).toEqual([])
    expect(parseEvidenceTypes('not json')).toEqual([])
    expect(parseEvidenceTypes(JSON.stringify(['mention', 'bogus']))).toEqual(['mention'])
    expect(parseEvidenceTypes(JSON.stringify([null, 1, { type: 'mention' }, 'reading']))).toEqual(['reading'])
  })

  test('serializes every known type once in the form order', () => {
    expect(serializeEvidenceTypes(['reading', 'mention', 'mention'])).toBe(JSON.stringify(['mention', 'reading']))
    expect(serializeEvidenceTypes([])).toBe('[]')
    expect(JSON.parse(serializeEvidenceTypes(EVIDENCE_TYPES))).toEqual([...EVIDENCE_TYPES])
  })
})
