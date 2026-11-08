import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LOCALES, catalogues } from './i18n'

const source = new URL('../', import.meta.url)
const KEY_CALL = /\bt\(\s*(?:[A-Za-z_$][\w$.]*|'[^']*')\s*,\s*'((?:[a-zA-Z][a-zA-Z0-9]*\.)+[a-zA-Z][a-zA-Z0-9]*)'/g

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return files(path)
    return /\.(svelte|ts)$/.test(entry.name) && !entry.name.endsWith('.test.ts') ? [path] : []
  })
}

function keysUsedInSource(): string[] {
  const keys = new Set<string>()
  for (const file of files(source.pathname)) {
    for (const match of readFileSync(file, 'utf8').matchAll(KEY_CALL)) keys.add(match[1])
  }
  return [...keys].sort()
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort()

describe('message catalogues', () => {
  test('cover exactly the keys the public pages use', () => {
    expect(Object.keys(catalogues.en).sort()).toEqual(keysUsedInSource())
  })

  test('give every locale the same keys and no empty values', () => {
    const expected = Object.keys(catalogues.en).sort()
    for (const locale of LOCALES) {
      expect(Object.keys(catalogues[locale]).sort(), locale).toEqual(expected)
      for (const [key, value] of Object.entries(catalogues[locale])) {
        expect(typeof value, `${locale} ${key}`).toBe('string')
        expect(value.trim(), `${locale} ${key}`).not.toBe('')
      }
    }
  })

  test('keep the placeholders of every message', () => {
    for (const key of Object.keys(catalogues.en)) {
      const expected = placeholders(catalogues.en[key])
      for (const locale of LOCALES) expect(placeholders(catalogues[locale][key]), `${locale} ${key}`).toEqual(expected)
    }
  })
})
