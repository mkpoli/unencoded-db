import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { parseUnihan, unihanBlock } from './character-tables'
import { irgLinks, ortFindRef, ortUrl, uax45Url, workingSetOf } from './irg-ws'

test('workingSetOf maps Extension G, H and J code points to WS2015, WS2017 and WS2021', () => {
  expect(workingSetOf('\u{30000}')?.id).toBe('ws2015')
  expect(workingSetOf('\u{3134F}')?.id).toBe('ws2015')
  expect(workingSetOf('\u{31350}')?.id).toBe('ws2017')
  expect(workingSetOf('\u{323AF}')?.id).toBe('ws2017')
  expect(workingSetOf('\u{323B0}')?.id).toBe('ws2021')
  expect(workingSetOf('\u{3347F}')?.id).toBe('ws2021')
  expect(workingSetOf('噐')).toBeNull()
  expect(workingSetOf('\u{2EBF0}')).toBeNull()
  expect(workingSetOf('ab')).toBeNull()
})

test('ortFindRef normalizes WS2015 and WS2017 prefixes and excludes later horizontal extensions', () => {
  // WS2015 rewrites and verbatim prefixes
  expect(ortFindRef('ws2015', 'GHZR-10110.18')).toBe('GHZR10110.18')
  expect(ortFindRef('ws2015', 'GZ-3422507')).toBe('G_Z3422507')
  expect(ortFindRef('ws2015', 'GPGLG-2018')).toBe('G_PGLG2018')
  expect(ortFindRef('ws2015', 'SAT-05803')).toBe('USAT05803')
  expect(ortFindRef('ws2015', 'UK-02764')).toBe('UK-02764')
  expect(ortFindRef('ws2015', 'UTC-00969')).toBe('UTC-00969')
  expect(ortFindRef('ws2015', 'T13-3132')).toBe('T13-3132')
  expect(ortFindRef('ws2015', 'GCA-Y0017')).toBeNull()
  expect(ortFindRef('ws2015', 'VN-F0278')).toBeNull()

  // WS2017 rewrites, GDM range cap, and horizontal exclusions
  expect(ortFindRef('ws2017', 'SAT-06811')).toBe('USAT06811')
  expect(ortFindRef('ws2017', 'VN-F1634')).toBe('V-F1634')
  expect(ortFindRef('ws2017', 'GDM-00050')).toBe('GDM-00050')
  expect(ortFindRef('ws2017', 'GDM-00220')).toBe('GDM-00220')
  expect(ortFindRef('ws2017', 'GDM-00823')).toBeNull()
  expect(ortFindRef('ws2017', 'GHC-0708280')).toBeNull()
  expect(ortFindRef('ws2017', 'GU-31F68')).toBeNull()
  expect(ortFindRef('ws2017', 'GCA-F0054')).toBeNull()

  // WS2021 verbatim prefixes and horizontal exclusions
  expect(ortFindRef('ws2021', 'GZ-0381601')).toBe('GZ-0381601')
  expect(ortFindRef('ws2021', 'SAT-08575')).toBe('SAT-08575')
  expect(ortFindRef('ws2021', 'SATM-90367')).toBe('SATM-90367')
  expect(ortFindRef('ws2021', 'VN-F168F')).toBe('VN-F168F')
  expect(ortFindRef('ws2021', 'GWY-44150')).toBeNull()
  expect(ortFindRef('ws2021', 'GCA-Y0022')).toBeNull()
})

test('irgLinks prefers original working-set sources over horizontal extensions and links UAX #45', () => {
  // Ext G with horizontal G/V sources alongside the original UK source
  expect(irgLinks('\u{30001}', ['GCA-Y0017', 'VN-F0278', 'UK-01671'])).toEqual([
    { name: 'IRG WS2015', href: ortUrl('ws2015', 'UK-01671'), title: 'UK-01671' },
  ])
  // Ext H with horizontal GDM-00823 and original UK-10514
  expect(irgLinks('\u{3135A}', ['GDM-00823', 'UK-10514'])).toEqual([
    { name: 'IRG WS2017', href: ortUrl('ws2017', 'UK-10514'), title: 'UK-10514' },
  ])
  // Ext H with both GDM-00006 and UK-10512 prefers UK-10512
  expect(irgLinks('\u{31384}', ['GDM-00006', 'UK-10512'])).toEqual([
    { name: 'IRG WS2017', href: ortUrl('ws2017', 'UK-10512'), title: 'UK-10512' },
  ])
  // Ext H with horizontal GHC and original UTC emits both WS2017 and UAX #45
  expect(irgLinks('\u{31350}', ['GHC-0708280', 'UTC-03123'])).toEqual([
    { name: 'IRG WS2017', href: ortUrl('ws2017', 'UTC-03123'), title: 'UTC-03123' },
    { name: 'UAX #45', href: uax45Url('UTC-03123')!, title: 'UTC-03123' },
  ])
  // Ext J with GZ source
  expect(irgLinks('\u{323B5}', ['GZ-0381601'])).toEqual([
    { name: 'IRG WS2021', href: ortUrl('ws2021', 'GZ-0381601'), title: 'GZ-0381601' },
  ])
  // Earlier block with UTC source gets UAX #45 only
  expect(irgLinks('\u{2B88A}', ['UTC-00001'])).toEqual([
    { name: 'UAX #45', href: uax45Url('UTC-00001')!, title: 'UTC-00001' },
  ])
  expect(irgLinks('噐', ['GKX-0211.02', 'T3-4A31'])).toEqual([])
  expect(irgLinks('\u{30000}', [])).toEqual([])
})

test('real Unihan tables resolve IRG WS and UAX #45 links for Ext G, H, J and Ext E characters', () => {
  const sourcesOf = (char: string) => {
    const rows = parseUnihan(readFileSync(`static/unihan/${unihanBlock(char)}.tsv`, 'utf8'))
    return rows.get(char)?.sources.split(' ').filter(Boolean) ?? []
  }
  expect(irgLinks('\u{30003}', sourcesOf('\u{30003}'))).toEqual([
    { name: 'IRG WS2015', href: 'https://hc.jsecs.org/irg/ws2015/app/index.php?find=GHZR10110.18', title: 'GHZR-10110.18' },
  ])
  expect(irgLinks('\u{31357}', sourcesOf('\u{31357}'))).toEqual([
    { name: 'IRG WS2017', href: 'https://hc.jsecs.org/irg/ws2017/app/index.php?find=V-F1634', title: 'VN-F1634' },
  ])
  expect(irgLinks('\u{323B0}', sourcesOf('\u{323B0}'))).toEqual([
    { name: 'IRG WS2021', href: 'https://hc.jsecs.org/irg/ws2021/app/index.php?find=UTC-03207', title: 'UTC-03207' },
    { name: 'UAX #45', href: 'https://www.unicode.org/Public/UCD/latest/ucd/USourceData.txt#:~:text=UTC-03207%3B', title: 'UTC-03207' },
  ])
  expect(irgLinks('\u{2B88A}', sourcesOf('\u{2B88A}'))).toEqual([
    { name: 'UAX #45', href: 'https://www.unicode.org/Public/UCD/latest/ucd/USourceData.txt#:~:text=UTC-00001%3B', title: 'UTC-00001' },
  ])
})
