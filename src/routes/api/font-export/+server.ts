import { json } from '@sveltejs/kit'
import { composerDrawing, composerUrl, GLYPH_STYLES } from '$lib/composer'
import { env } from '$lib/server/guard'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async event => {
  const { results: records } = await env(event).DB.prepare(
    'SELECT id, ids, layout, cover_key FROM entries WHERE hidden_at IS NULL AND merged_into IS NULL ORDER BY id'
  ).all()
  const styles = GLYPH_STYLES.map(style => ({ style, version: composerDrawing(style), source: composerUrl(style) }))
  return json({ records, styles }, { headers: { 'cache-control': 'no-store' } })
}
