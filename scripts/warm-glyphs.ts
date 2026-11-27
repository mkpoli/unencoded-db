// Asks the site for each record's glyph in every style, so each is drawn and stored before a reader
// needs it. A new composer export or pin gives drawings a new address. `plan` lists the addresses
// wanted now and names the list by one key; `warm` asks for those no earlier run settled, and writes
// the settled ones down once the run has completed.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { executeD1 } from './d1'
import { GLYPH_STYLES, type GlyphStyle } from '../src/lib/composer'
import { glyphAddress } from '../src/lib/glyph-address'

export type Addresses = Record<GlyphStyle, string[]>
/** A drawing kept, a description the composer cannot draw, or the status of an address still open. */
export type Answer = 'drawn' | 'undrawable' | number
type Get = (url: string) => Promise<Response>
type Options = { get?: Get; pause?: (ms: number) => Promise<unknown>; log?: (line: string) => void }

/** What every key starts with; the number changes with the form of the settled list. */
export const KEY_PREFIX = 'warm-glyphs-v1-'
const WORKERS = 4
const ATTEMPTS = 3

/** Each style's addresses, one per drawing, in the order of the records. */
export function addressesOf(records: { ids: string; layout: string | null }[]) {
  return Object.fromEntries(GLYPH_STYLES.map(style => [style, [...new Set(records.map(record => glyphAddress(record.ids, record.layout, style)).filter(Boolean))]])) as Addresses
}

/** One name for a set of addresses, whatever their order. An address carries its export and composer,
 *  so a new version of either is a new key. */
export function keyOf(addresses: Addresses) {
  const all = GLYPH_STYLES.flatMap(style => addresses[style] ?? []).sort()
  return KEY_PREFIX + new Bun.CryptoHasher('sha256').update(all.join('\n')).digest('hex')
}

/** One address, asked until it is settled or the attempts run out. A cold shard can outlast one
 *  request, and a rate limit answers 429: both are asked again, after a pause. A 404 is final, and
 *  settles the address only when it says the composer cannot draw the description. */
export async function ask(url: string, { get = address => fetch(address, { signal: AbortSignal.timeout(60_000) }), pause = Bun.sleep }: Options = {}): Promise<Answer> {
  let status = 0, retryAfter: string | null = null
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    if (attempt) await pause(status === 429 ? 1000 * Math.min(Number(retryAfter) || 15, 60) : 3000)
    const response = await get(url).catch(() => null)
    status = response?.status ?? 0
    if (status === 200) return 'drawn'
    if (status === 404) {
      const answer = await response?.json().catch(() => null) as { undrawable?: unknown } | null
      return answer?.undrawable === true ? 'undrawable' : 404
    }
    retryAfter = response?.headers.get('retry-after') ?? null
  }
  return status
}

/** Asks for the addresses `settled` does not list. Answers the wanted addresses settled by now, and
 *  the styles the run did not work for; an address left open is asked again by the next run. */
export async function warm(origin: string, addresses: Addresses, settled: Iterable<string>, options: Options = {}) {
  const log = options.log ?? console.log
  const before = new Set(settled), now: string[] = [], unwarmed: GlyphStyle[] = []
  for (const style of GLYPH_STYLES) {
    const wanted = addresses[style] ?? []
    const pending = wanted.filter(address => !before.has(address))
    now.push(...wanted.filter(address => before.has(address)))
    let next = 0, drawn = 0, undrawable = 0
    const open: string[] = []
    const worker = async () => {
      while (next < pending.length) {
        const address = pending[next++]
        const answer = await ask(origin + address, options)
        if (typeof answer === 'number') { open.push(`${answer} ${decodeURIComponent(address)}`); continue }
        now.push(address)
        if (answer === 'drawn') drawn++; else undrawable++
      }
    }
    await Promise.all(Array.from({ length: WORKERS }, worker))
    log(`${style}: ${wanted.length} wanted, ${wanted.length - pending.length} settled before, ${drawn} drawn, ${undrawable} not drawable, ${open.length} open.`)
    for (const line of open.slice(0, 20)) log(`  ${line}`)
    // A description the composer cannot draw is an answer. A few open addresses are expected; a style
    // mostly open means the run did not work.
    if (open.length > wanted.length / 20) unwarmed.push(style)
  }
  return { settled: now, unwarmed }
}

if (import.meta.main) {
  const usage = 'usage: bun scripts/warm-glyphs.ts plan <folder> | warm https://<site> <folder>'
  const [command, ...rest] = process.argv.slice(2)
  if (command === 'plan' && rest.length === 1) {
    const [folder] = rest
    const sql = 'SELECT ids, layout FROM entries WHERE ids IS NOT NULL AND hidden_at IS NULL AND merged_into IS NULL ORDER BY sightings DESC, id'
    const records = JSON.parse(executeD1('--remote', '--json', '--command', sql))[0].results as { ids: string; layout: string | null }[]
    const addresses = addressesOf(records), key = keyOf(addresses)
    mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, 'addresses.json'), JSON.stringify(addresses))
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `key=${key}\n`)
    console.log(`${records.length} records, ${key}`)
  } else if (command === 'warm' && rest.length === 2 && rest[0].startsWith('https://')) {
    const [origin, folder] = rest
    const addresses = JSON.parse(readFileSync(join(folder, 'addresses.json'), 'utf8')) as Addresses
    const list = join(folder, 'settled.json')
    const { settled, unwarmed } = await warm(origin, addresses, existsSync(list) ? JSON.parse(readFileSync(list, 'utf8')) as string[] : [])
    if (unwarmed.length) throw new Error(`Not warmed: ${unwarmed.join(', ')}`)
    writeFileSync(list, JSON.stringify(settled))
  } else throw new Error(usage)
}
