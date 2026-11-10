import { error } from '@sveltejs/kit'
import { SCRIPT_MAX } from '$lib/script'
import { cleanIds } from '$lib/ids'
import { glyphPaths, warmGlyphs } from '$lib/server/glyphs'
import { publicEntryPredicate } from '$lib/server/visibility'
import type { PageServerLoad } from './$types'

type ListedEntry = { id: number; script: string; ids: string | null; evidence: number; first_year: number | null; category: string | null }

export const load: PageServerLoad = async ({ platform, url }) => {
  if (!platform) error(500, 'Database unavailable')
  const before = url.searchParams.get('before')
  const id = before && /^[1-9]\d*$/.test(before) && Number.isSafeInteger(Number(before)) ? Number(before) : Number.MAX_SAFE_INTEGER
  const requested = url.searchParams.get('script')
  // Browsing stays on Han until other scripts are opened; an explicit script is still honoured.
  const script = requested === null ? 'Han' : requested.normalize('NFC').trim()
  if (!script || script.length > SCRIPT_MAX) error(404)
  const requestedIvd = url.searchParams.get('ivd')
  const ivd = requestedIvd === null ? null : requestedIvd
  if (ivd !== null && ivd !== 'registered' && ivd !== 'none') error(404)
  const filters: string[] = []
  const filterBinds: string[] = []
  if (ivd !== null) { filters.push('ivd_status = ?'); filterBinds.push(ivd) }
  filters.push('script = ?'); filterBinds.push(script)
  const filter = filters.length ? ` AND ${filters.join(' AND ')}` : ''
  const page = await platform.env.DB.prepare(`SELECT id, script, ids, (SELECT count(*) FROM evidence ev WHERE ev.entry_id = entries.id) AS evidence, (SELECT min(ev.date_year) FROM evidence ev WHERE ev.entry_id = entries.id AND ev.date_year IS NOT NULL) AS first_year, (SELECT g.label FROM entry_genres eg JOIN genres g ON g.slug = eg.genre WHERE eg.entry_id = entries.id ORDER BY eg.genre LIMIT 1) AS category FROM entries WHERE ${publicEntryPredicate}${filter} AND id < ? ORDER BY id DESC LIMIT 21`).bind(...filterBinds, id).all<ListedEntry>()
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
  return { entries, next: page.results.length > 20 ? page.results[19].id : null, glyphs, script: requested === null ? null : script, ivd }
}
