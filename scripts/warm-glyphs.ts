// Asks the site for every record's glyph in every style, so each is drawn and stored before a reader
// needs it. A new composer export or pin gives drawings a new address; run after each deploy.
import { executeD1 } from './d1'
import { GLYPH_STYLES } from '../src/lib/composer'
import { glyphAddress } from '../src/lib/glyph-address'

const [origin, ...extra] = process.argv.slice(2)
if (!origin?.startsWith('https://') || extra.length) throw new Error('usage: bun scripts/warm-glyphs.ts https://<site>')
const WORKERS = 4
const unwarmed: string[] = []
const sql = 'SELECT ids, layout FROM entries WHERE ids IS NOT NULL AND hidden_at IS NULL AND merged_into IS NULL ORDER BY sightings DESC, id'
const records = JSON.parse(executeD1('--remote', '--json', '--command', sql))[0].results as { ids: string; layout: string | null }[]
for (const style of GLYPH_STYLES) {
  const addresses = [...new Set(records.map(record => glyphAddress(record.ids, record.layout, style)))]
  let next = 0, drawn = 0
  const failed: string[] = []
  const worker = async () => {
    while (next < addresses.length) {
      const address = addresses[next++]
      let retryAfter: string | null = null
      let status = 0
      // A cold shard can outlast one request, and a rate limit answers 429: both are asked again, after a pause.
      for (let attempt = 0; attempt < 3 && status !== 200 && status !== 404; attempt++) {
        if (attempt) await Bun.sleep(status === 429 ? 1000 * Math.min(Number(retryAfter) || 15, 60) : 3000)
        const response = await fetch(origin + address, { signal: AbortSignal.timeout(60_000) }).catch(() => null)
        status = response?.status ?? 0
        retryAfter = response?.headers.get('retry-after') ?? null
      }
      if (status === 200) drawn++; else failed.push(`${status} ${decodeURIComponent(address)}`)
    }
  }
  await Promise.all(Array.from({ length: WORKERS }, worker))
  console.log(`${style}: ${drawn} of ${addresses.length} drawn.`)
  for (const line of failed.slice(0, 20)) console.log(`  ${line}`)
  // A few descriptions the composer cannot draw are expected; a style mostly undrawn means the run did not work.
  if (failed.length > addresses.length / 20) unwarmed.push(style)
}
if (unwarmed.length) throw new Error(`Not warmed: ${unwarmed.join(', ')}`)
