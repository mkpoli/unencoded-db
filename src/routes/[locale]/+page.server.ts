import { error } from '@sveltejs/kit'
import { isHanScript, SCRIPT_MAX } from '$lib/script'
import { cleanIds } from '$lib/ids'
import { glyphPaths, warmGlyphs } from '$lib/server/glyphs'
import { publicEntryPredicate } from '$lib/server/visibility'
import type { PageServerLoad } from './$types'

type ListedEntry = { id: number; script: string; ids: string | null; place: string }
type ScriptCount = { script: string; n: number }

export const load: PageServerLoad = async ({ platform, url }) => {
  if (!platform) error(500, 'Database unavailable')
  const before = url.searchParams.get('before')
  const id = before && /^[1-9]\d*$/.test(before) && Number.isSafeInteger(Number(before)) ? Number(before) : Number.MAX_SAFE_INTEGER
  const requested = url.searchParams.get('script')
  const script = requested === null ? null : requested.normalize('NFC').trim()
  if (script !== null && (!script || script.length > SCRIPT_MAX)) error(404)
  const requestedIvd = url.searchParams.get('ivd')
  const ivd = requestedIvd === null ? null : requestedIvd
  if (ivd !== null && ivd !== 'registered' && ivd !== 'none') error(404)
  const filters: string[] = []
  const filterBinds: string[] = []
  if (ivd !== null) { filters.push('ivd_status = ?'); filterBinds.push(ivd) }
  if (script !== null) { filters.push('script = ?'); filterBinds.push(script) }
  const filter = filters.length ? ` AND ${filters.join(' AND ')}` : ''
  const [page, counted] = await Promise.all([
    platform.env.DB.prepare(`SELECT id, script, ids, place FROM entries WHERE ${publicEntryPredicate}${filter} AND id < ? ORDER BY id DESC LIMIT 21`).bind(...filterBinds, id).all<ListedEntry>(),
    platform.env.DB.prepare('SELECT script, n FROM script_counts').bind().all<ScriptCount>(),
  ])
  const total = counted.results.reduce((sum, row) => sum + row.n, 0)
  const scripts = counted.results.sort((a, b) =>
    Number(isHanScript(b.script)) - Number(isHanScript(a.script)) || b.n - a.n || a.script.localeCompare(b.script))
  // A script whose last record was just hidden keeps its tab while it is the filter.
  if (script !== null && !scripts.some(row => row.script === script)) scripts.push({ script, n: 0 })
  const entries = page.results.slice(0, 20)
  const sequences = entries.map(entry => entry.ids).filter((id): id is string => Boolean(id))
  const paths = await glyphPaths(platform.env.IMAGES, sequences)
  const glyphs: Record<string, string> = {}
  for (const entry of entries) {
    const path = entry.ids ? paths[cleanIds(entry.ids)] : null
    if (entry.ids && path) glyphs[entry.ids] = path
  }
  const missing = [...new Set(sequences.map(cleanIds).filter(id => !paths[id]))]
  if (missing.length) platform.ctx?.waitUntil(warmGlyphs(platform.env.IMAGES, missing))
  return { entries, next: page.results.length > 20 ? page.results[19].id : null, glyphs, scripts, total, script, ivd }
}
