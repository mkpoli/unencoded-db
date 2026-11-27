import { afterEach, expect, setSystemTime, test } from 'bun:test'
import { keptOf, lru, MISSING, MISSING_MS } from './glyph-cache'

afterEach(() => { setSystemTime() })

const texts = (entries: number, weight: number) => lru<string>({ entries, weight }, text => text.length)

test('a store answers with what it was given', () => {
  const store = texts(4, 100)
  expect(store.get('a')).toBeUndefined()
  store.set('a', 'M0 0')
  expect(store.get('a')).toBe('M0 0')
  expect(store.size).toBe(1)
  expect(store.weight).toBe(4)
})

test('a full store lets go of what was read longest ago', () => {
  const store = texts(2, 100)
  store.set('a', 'A')
  store.set('b', 'B')
  expect(store.get('a')).toBe('A')
  store.set('c', 'C')
  expect(store.get('b')).toBeUndefined()
  expect(store.get('a')).toBe('A')
  expect(store.get('c')).toBe('C')
  expect(store.size).toBe(2)
})

test('a store stays within its weight', () => {
  const store = texts(100, 10)
  store.set('a', 'aaaa')
  store.set('b', 'bbbb')
  store.set('c', 'cccc')
  expect(store.get('a')).toBeUndefined()
  expect(store.get('b')).toBe('bbbb')
  expect(store.get('c')).toBe('cccc')
  expect(store.weight).toBe(8)
  // What is heavier than the whole store is left out, and what is there stays.
  store.set('d', 'd'.repeat(11))
  expect(store.get('d')).toBeUndefined()
  expect(store.size).toBe(2)
})

test('a value set again replaces the first and its weight', () => {
  const store = texts(4, 10)
  store.set('a', 'aaaaaa')
  store.set('a', 'aa')
  expect(store.get('a')).toBe('aa')
  expect(store.weight).toBe(2)
  expect(store.size).toBe(1)
})

test('a value with an end is gone once it has passed', () => {
  setSystemTime(new Date('2026-01-01T00:00:00Z'))
  const store = texts(4, 10)
  store.set('a', 'A', Date.now() + 1000)
  store.set('b', 'B')
  setSystemTime(new Date('2026-01-01T00:00:00.999Z'))
  expect(store.get('a')).toBe('A')
  setSystemTime(new Date('2026-01-01T00:00:01Z'))
  expect(store.get('a')).toBeUndefined()
  expect(store.get('b')).toBe('B')
  expect(store.weight).toBe(1)
})

test('each bucket has a store of its own', async () => {
  const one = {}, other = {}
  expect(keptOf(one)).toBe(keptOf(one))
  keptOf(one).keepDrawing('k', 'M0 0')
  expect(await keptOf(one).drawing('k')).toBe('M0 0')
  expect(await keptOf(other).drawing('k')).toBeNull()
})

test('a store holds what was read, never the reading of it', async () => {
  const store = keptOf({})
  store.keepDrawing('d', 'M0 0')
  store.keepFile('f', new Uint8Array([1, 2, 3]), 'application/json')
  store.keepMissing('m')
  const drawing = store.drawing('d'), file = store.file('f')
  // Each lookup is a promise of its own, and what it settles to is the value itself.
  expect(store.drawing('d')).not.toBe(drawing)
  expect(await drawing).toBe('M0 0')
  expect(await file).toEqual(new Uint8Array([1, 2, 3]))
  expect(await store.file('m')).toBe(MISSING)
})

test('an empty drawing is not kept', async () => {
  const store = keptOf({})
  store.keepDrawing('d', '')
  expect(await store.drawing('d')).toBeNull()
})

test('a missing shard is forgotten after five minutes', async () => {
  setSystemTime(new Date('2026-01-01T00:00:00Z'))
  const store = keptOf({})
  store.keepMissing('m')
  setSystemTime(new Date(Date.now() + MISSING_MS - 1))
  expect(await store.file('m')).toBe(MISSING)
  setSystemTime(new Date(Date.now() + 1))
  expect(await store.file('m')).toBeNull()
})
