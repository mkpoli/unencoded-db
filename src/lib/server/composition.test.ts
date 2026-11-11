import { describe, expect, test } from 'bun:test'
import { readComposition } from './composition'

function form(value: string) {
  const data = new FormData()
  data.set('composition', value)
  return data
}

describe('submitted composition', () => {
  test('keeps the parts and roles chosen for the first description', () => {
    expect(readComposition(form('{"ids":"⿰青鳥","parts":["青","鳥"],"roles":["phonetic","semantic"]}'), '⿰青鳥'))
      .toBe('{"ids":"⿰青鳥","parts":["青","鳥"],"roles":["phonetic","semantic"],"formation":null}')
  })

  test('adds the parsed parts to a record tagged before parts could be edited', () => {
    expect(readComposition(form('{"ids":"⿰青鳥","roles":["phonetic","semantic"]}'), '⿰青鳥'))
      .toBe('{"ids":"⿰青鳥","parts":["青","鳥"],"roles":["phonetic","semantic"],"formation":null}')
  })

  test('keeps custom parts, a custom role and a custom formation', () => {
    expect(readComposition(form('{"ids":"⿰青鳥","parts":["青","鳥","口"],"roles":["亦聲","semantic",""],"formation":"形聲兼會意"}'), '⿰青鳥'))
      .toBe('{"ids":"⿰青鳥","parts":["青","鳥","口"],"roles":["亦聲","semantic",""],"formation":"形聲兼會意"}')
  })

  test('drops parts without roles and keeps a formation without parts', () => {
    expect(readComposition(form('{"ids":"⿰青鳥","parts":["青","鳥"],"roles":[]}'), '⿰青鳥')).toBeNull()
    expect(readComposition(form('{"ids":"木","formation":"指事"}'), '木'))
      .toBe('{"ids":"木","parts":[],"roles":[],"formation":"指事"}')
  })

  test('drops an empty part with its role', () => {
    expect(readComposition(form('{"ids":"⿰青鳥","parts":["青",""],"roles":["phonetic","semantic"]}'), '⿰青鳥'))
      .toBe('{"ids":"⿰青鳥","parts":["青"],"roles":["phonetic"],"formation":null}')
  })

  test('keeps a custom part on a description of one component', () => {
    expect(readComposition(form('{"ids":"木","parts":["木"],"roles":["semantic"]}'), '木'))
      .toBe('{"ids":"木","parts":["木"],"roles":["semantic"],"formation":null}')
  })

  test('keeps a preset role and a fanqie pair', () => {
    expect(readComposition(form('{"ids":"⿰取女","parts":["取","女"],"roles":["also","semantic"]}'), '⿰取女'))
      .toBe('{"ids":"⿰取女","parts":["取","女"],"roles":["also","semantic"],"formation":null}')
    expect(readComposition(form('{"ids":"⿰取女","parts":["取","女"],"roles":["fanqieUpper","fanqieLower"]}'), '⿰取女'))
      .toBe('{"ids":"⿰取女","parts":["取","女"],"roles":["fanqieUpper","fanqieLower"],"formation":null}')
  })

  test('drops roles named against another description', () => {
    expect(readComposition(form('{"ids":"⿰木木","parts":["木","木"],"roles":["semantic","phonetic"]}'), '⿰青鳥')).toBeNull()
  })

  test('drops an empty or malformed field', () => {
    expect(readComposition(form(''), '⿰青鳥')).toBeNull()
    expect(readComposition(form('no'), '⿰青鳥')).toBeNull()
    expect(readComposition(form('{"ids":"⿰青鳥"}'), '⿰青鳥')).toBeNull()
    expect(readComposition(form('{"ids":"⿰青鳥","parts":[],"roles":[]}'), '⿰青鳥')).toBeNull()
  })
})
