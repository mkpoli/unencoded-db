import { describe, expect, test } from 'bun:test'
import { readComposition } from './composition'

function form(value: string) {
  const data = new FormData()
  data.set('composition', value)
  return data
}

describe('submitted composition', () => {
  test('keeps the roles chosen for the first description', () => {
    expect(readComposition(form('{"ids":"⿰亻七","roles":["semantic","phonetic"]}'), '⿰亻七 ⿱木木'))
      .toBe('{"ids":"⿰亻七","roles":["semantic","phonetic"]}')
  })

  test('trims roles the description has no part for', () => {
    expect(readComposition(form('{"ids":"⿰亻七","roles":["semantic","phonetic","symbol"]}'), '⿰亻七'))
      .toBe('{"ids":"⿰亻七","roles":["semantic","phonetic"]}')
  })

  test('drops roles named against another description', () => {
    expect(readComposition(form('{"ids":"⿰木木","roles":["semantic","phonetic"]}'), '⿰亻七')).toBeNull()
  })

  test('drops an empty or malformed field', () => {
    expect(readComposition(form(''), '⿰亻七')).toBeNull()
    expect(readComposition(form('no'), '⿰亻七')).toBeNull()
    expect(readComposition(form('{"ids":"⿰亻七","roles":[""]}'), '⿰亻七')).toBeNull()
  })

  test('drops roles on a description with nothing to tag', () => {
    expect(readComposition(form('{"ids":"木","roles":["semantic"]}'), '木')).toBeNull()
  })
})
