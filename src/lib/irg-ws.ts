// Links from an encoded CJK ideograph's Unihan IRG source references to its IRG Working Set
// Online Review Tool (ORT) entry on hc.jsecs.org and, for U-source ideographs, to UAX #45.
//
// Each CJK extension block maps to the IRG working set that produced it:
//   - Extension G (U+30000..U+3134F) -> WS2015 (https://hc.jsecs.org/irg/ws2015/app/)
//   - Extension H (U+31350..U+323AF) -> WS2017 (https://hc.jsecs.org/irg/ws2017/app/)
//   - Extension J (U+323B0..U+3347F) -> WS2021 (https://hc.jsecs.org/irg/ws2021/app/)
// Active candidate submissions live in WS2024 (https://hc.jsecs.org/irg/ws2024/app/). All four ORT
// apps accept 5-digit zero-padded serial lookups (`?id=00001`), and ws2017/ws2021/ws2024 accept
// IDS-substring lookups (`?ids=...`).
//
// Prefix allowlists and `?find=` punctuation rewrites (GHZR, G_Z, G_PGLG, USAT, V-, and WS2017's
// GDM-00001..00220 cap) are derived from Unihan 18.0.0 Unihan_IRGSources.txt and verified against
// live hc.jsecs.org ORT endpoints. Horizontal extensions added in later Unicode versions are
// excluded; when a character carries both a G-source and another working-set source, the non-G
// source is preferred because later horizontal extensions (e.g. GZ-, GDM-) share prefixes with
// original working-set submissions.
import { cleanIds } from './ids'

export type WorkingSetId = 'ws2015' | 'ws2017' | 'ws2021'
export type ReviewWorkingSetId = WorkingSetId | 'ws2024'
export type IrgLink = { name: string; href: string; title: string }

export const ACTIVE_WORKING_SET = 'ws2024' as const
export const ACTIVE_WORKING_SET_LABEL = 'IRG WS2024'

const WS_CODE = /^WS(2015|2017|2021|2024)-(\d{5})$/
const SERIAL_DIGITS = /^\d{1,5}$/

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

/** Direct URL to an IRG Working Set ORT entry by its serial number (1..99999, zero-padded to 5 digits), or null if invalid. */
export function ortSerialUrl(ws: ReviewWorkingSetId, serial: string): string | null {
  if (!SERIAL_DIGITS.test(serial) || Number(serial) < 1) return null
  return `https://hc.jsecs.org/irg/${ws}/app/index.php?id=${serial.padStart(5, '0')}`
}

/**
 * Parses a canonical working-set serial code (`WS2015-00001`, `WS2017-00001`, `WS2021-00001`, or
 * `WS2024-00001`, serial `00001`..`99999`) into its working-set slug and 5-digit serial, or null.
 */
export function parseWorkingSetCode(code: string): { ws: ReviewWorkingSetId; serial: string } | null {
  const match = WS_CODE.exec(code.trim())
  if (!match || Number(match[2]) < 1) return null
  return { ws: `ws${match[1]}` as ReviewWorkingSetId, serial: match[2] }
}

/** Direct ORT URL for a canonical working-set serial code (e.g. `WS2024-00001`), or null if invalid. */
export function workingSetPage(code: string): string | null {
  const parsed = parseWorkingSetCode(code)
  return parsed ? ortSerialUrl(parsed.ws, parsed.serial) : null
}

/** Direct ORT IDS-substring lookup URL for an active working set (`ws2017`, `ws2021`, or `ws2024`). */
export function ortIdsUrl(ids: string, ws: Exclude<ReviewWorkingSetId, 'ws2015'> = ACTIVE_WORKING_SET): string | null {
  const sequence = cleanIds(ids)
  return sequence ? `https://hc.jsecs.org/irg/${ws}/app/index.php?ids=${encodeURIComponent(sequence)}` : null
}

/**
 * Direct URL to a U-source ideograph's row in Unicode's UAX #45 `USourceData.txt`.
 * Escapes `-` as `%2D` per the Scroll-to-Text Fragment grammar, where bare `-` delimits prefixes/suffixes.
 */
export function uax45Url(utcSource: string): string | null {
  if (!UTC_SOURCE.test(utcSource)) return null
  const fragment = encodeURIComponent(`${utcSource};`).replace(/-/g, '%2D')
  return `https://www.unicode.org/Public/UCD/latest/ucd/USourceData.txt#:~:text=${fragment}`
}

// Pick the highest-confidence original working-set source. Unihan lists G-sources first, but many
// multi-source characters gained GZ-/GDM-/GKJ-/GXM- horizontal extensions after the working set
// closed, so prefer any non-G working-set source when both are present.
function pickWorkingSetSource(ws: WorkingSetId, sources: readonly string[]): { source: string; findRef: string } | null {
  let gFallback: { source: string; findRef: string } | null = null
  for (const source of sources) {
    const findRef = ortFindRef(ws, source)
    if (!findRef) continue
    if (source.startsWith('G')) {
      gFallback ??= { source, findRef }
      continue
    }
    return { source, findRef }
  }
  return gFallback
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
