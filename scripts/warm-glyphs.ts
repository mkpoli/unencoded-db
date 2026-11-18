// Asks the site for every record's glyph in every style, so each is drawn and stored before a reader
// needs it. A new composer export or pin gives drawings a new address; run after each deploy.
import { executeD1 } from './d1'
import { GLYPH_STYLES } from '../src/lib/composer'
import { glyphAddress } from '../src/lib/glyph-address'

const [origin, ...extra] = process.argv.slice(2)
if (!origin?.startsWith('https://') || extra.length) throw new Error('usage: bun scripts/warm-glyphs.ts https://<site>')
const WORKERS = 4
const sql = 'SELECT ids, layout FROM entries WHERE ids IS NOT NULL AND hidden_at IS NULL AND merged_into IS NULL ORDER BY sightings DESC, id'
const records = JSON.parse(executeD1('--remote', '--json', '--command', sql))[0].results as { ids: string; layout: string | null }[]
for (const style of GLYPH_STYLES) {
  const addresses = [...new Set(records.map(record => glyphAddress(record.ids, record.layout, style)))]
  let next = 0, drawn = 0
  const failed: string[] = []
  const worker = async () => {
    while (next < addresses.length) {
      const address = addresses[next++]
      let status = 0
      // A cold shard can outlast one request, and the zone's rate limit answers 429: both are asked again.
      for (let attempt = 0; attempt < 6 && status !== 200 && status !== 404; attempt++) {
        const response = await fetch(origin + address, { signal: AbortSignal.timeout(60_000) }).catch(() => null)
        status = response?.status ?? 0
        if (status === 429) await Bun.sleep(1000 * Math.min(Number(response?.headers.get('retry-after')) || 10, 60))
      }
      if (status === 200) drawn++; else failed.push(`${status} ${decodeURIComponent(address)}`)
    }
  }
  await Promise.all(Array.from({ length: WORKERS }, worker))
  console.log(`${style}: ${drawn} of ${addresses.length} drawn.`)
  for (const line of failed.slice(0, 20)) console.log(`  ${line}`)
}
