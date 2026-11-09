import { describe, expect, test } from 'bun:test'
import { DEFAULT_SCRIPT, SCRIPTS, scriptOptions } from './script'

describe('script options', () => {
  test('start with Han and keep the known list in order', () => {
    expect(DEFAULT_SCRIPT).toBe('Han')
    expect(scriptOptions('')).toEqual([...SCRIPTS])
    expect(scriptOptions('Han')).toEqual([...SCRIPTS])
  })

  test('keep a current value that is not in the list', () => {
    expect(scriptOptions('Old script')).toEqual([...SCRIPTS, 'Old script'])
    expect(scriptOptions('  Old script  ')).toEqual([...SCRIPTS, 'Old script'])
  })
})
