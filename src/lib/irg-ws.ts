// Links from an encoded CJK ideograph's Unihan IRG source references to its IRG Working Set
// Online Review Tool (ORT) entry on hc.jsecs.org and, for U-source ideographs, to UAX #45.
//
// Each CJK extension block maps to the IRG working set that produced it:
//   - Extension G (U+30000..U+3134F) -> WS2015
//   - Extension H (U+31350..U+323AF) -> WS2017
//   - Extension J (U+323B0..U+3347F) -> WS2021
//
// Horizontal extensions added to those blocks in later Unicode releases are not present in the
// original working set's ORT database, and WS2015/WS2017 used slightly different source-reference
// punctuation for a few prefixes (e.g. GHZR-, GZ-, GPGLG-, SAT-, VN-). Only original working-set
// references are linked so every generated link resolves to a live review record.

export type WorkingSetId = 'ws2015' | 'ws2017' | 'ws2021'
export type IrgLink = { name: string; href: string; title: string }

type WorkingSetSpec = {
  id: WorkingSetId
  label: string
  from: number
  to: number
}

const WORKING_SETS: readonly WorkingSetSpec[] = [
  { id: 'ws2015', label: 'IRG WS2015', from: 0x30000, to: 0x3134F },
  { id: 'ws2017', label: 'IRG WS2017', from: 0x31350, to: 0x323AF },
  { id: 'ws2021', label: 'IRG WS2021', from: 0x323B0, to: 0x3347F },
]

const WS2015_VERBATIM = new Set(['UK', 'UTC', 'KC', 'T13', 'TB', 'TC', 'TD'])
const WS2017_VERBATIM = new Set(['UK', 'UTC', 'KC', 'T12', 'T13', 'TB', 'TC', 'TE', 'V0', 'V4', 'GZ', 'GZA', 'GKJ', 'GLGYJ', 'GPGLG', 'GXM'])
const WS2021_VERBATIM = new Set([
  'UK', 'UTC', 'KC', 'SAT', 'SATM', 'T9', 'T11', 'TB', 'TC', 'TD', 'TE', 'TF',
  'V0', 'V1', 'V2', 'V3', 'V4', 'VN', 'GDM', 'GKJ', 'GXM', 'GZ',
])

const WS2017_GDM_MAX = 220
const UTC_SOURCE = /^UTC-\d{5}$/

/** The IRG Working Set that produced an encoded ideograph's block, or null for other blocks. */
export function workingSetOf(char: string): WorkingSetSpec | null {
  if ([...char].length !== 1) return null
  const point = char.codePointAt(0)!
  return WORKING_SETS.find(set => point >= set.from && point <= set.to) ?? null
}

/**
 * Normalizes a Unihan `kIRG_*Source` value into the `?find=` parameter accepted by that working
 * set's ORT on `hc.jsecs.org`, or null when the source was added later as a horizontal extension.
 */
export function ortFindRef(ws: WorkingSetId, source: string): string | null {
  const dash = source.indexOf('-')
  if (dash <= 0) return null
  const prefix = source.slice(0, dash)
  const rest = source.slice(dash + 1)
  if (!rest) return null

  if (ws === 'ws2015') {
    if (WS2015_VERBATIM.has(prefix)) return source
    if (prefix === 'GHZR') return `GHZR${rest}`
    if (prefix === 'GZ') return `G_Z${rest}`
    if (prefix === 'GPGLG') return `G_PGLG${rest}`
    if (prefix === 'SAT') return `USAT${rest}`
    return null
  }

  if (ws === 'ws2017') {
    if (WS2017_VERBATIM.has(prefix)) return source
    if (prefix === 'SAT') return `USAT${rest}`
    if (prefix === 'VN') return `V-${rest}`
    if (prefix === 'GDM') {
      const number = /^\d+$/.test(rest) ? Number(rest) : NaN
      return number >= 1 && number <= WS2017_GDM_MAX ? source : null
    }
    return null
  }

  return WS2021_VERBATIM.has(prefix) ? source : null
}

/** Direct URL to a character's IRG Working Set ORT review page by its ORT lookup reference. */
export function ortUrl(ws: WorkingSetId, findRef: string): string {
  return `https://hc.jsecs.org/irg/${ws}/app/index.php?find=${encodeURIComponent(findRef)}`
}

/** Direct URL to a U-source ideograph's row in Unicode's UAX #45 `USourceData.txt`. */
export function uax45Url(utcSource: string): string | null {
  return UTC_SOURCE.test(utcSource)
    ? `https://www.unicode.org/Public/UCD/latest/ucd/USourceData.txt#:~:text=${encodeURIComponent(`${utcSource};`)}`
    : null
}

// Pick the best source reference for a working set. In WS2017, GDM-00001..00220 overlaps with
// withdrawn/reassigned numbers on a handful of multi-source entries, so prefer any other
// WS2017-native source when one is present.
function pickWorkingSetSource(ws: WorkingSetId, sources: readonly string[]): { source: string; findRef: string } | null {
  let fallback: { source: string; findRef: string } | null = null
  for (const source of sources) {
    const findRef = ortFindRef(ws, source)
    if (!findRef) continue
    if (ws === 'ws2017' && source.startsWith('GDM-')) {
      fallback ??= { source, findRef }
      continue
    }
    return { source, findRef }
  }
  return fallback
}

/** IRG Working Set ORT and UAX #45 links for an encoded character from its Unihan IRG sources. */
export function irgLinks(char: string, sources: readonly string[] | null | undefined): IrgLink[] {
  if (!sources?.length) return []
  const links: IrgLink[] = []
  const ws = workingSetOf(char)
  if (ws) {
    const picked = pickWorkingSetSource(ws.id, sources)
    if (picked) links.push({ name: ws.label, href: ortUrl(ws.id, picked.findRef), title: picked.source })
  }
  const utc = sources.find(source => UTC_SOURCE.test(source))
  if (utc) {
    const href = uax45Url(utc)
    if (href) links.push({ name: 'UAX #45', href, title: utc })
  }
  return links
}
