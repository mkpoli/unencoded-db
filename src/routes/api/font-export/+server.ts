import { json } from '@sveltejs/kit'
import { composerDrawing, composerUrl, GLYPH_STYLES } from '$lib/composer'
import { env } from '$lib/server/guard'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async event => {
  const { results: records } = await env(event).DB.prepare(
    `SELECT e.id, e.ids, e.layout, e.cover_key,
      (SELECT s.id FROM sighting_media x INDEXED BY sighting_media_by_thumb
       JOIN sightings s ON s.id = x.sighting_id
       WHERE x.thumb_key = e.cover_key AND s.entry_id = e.id AND s.hidden_at IS NULL
         AND json_array_length(x.box) > 0 ORDER BY s.id LIMIT 1) AS marked_sighting
     FROM entries e INDEXED BY entries_live_export
     WHERE e.hidden_at IS NULL AND e.merged_into IS NULL ORDER BY e.id`
  ).all()
  const styles = GLYPH_STYLES.map(style => {
    const version = composerDrawing(style), adjustedVersion = composerDrawing(style, true)
    return { style, version, ...(adjustedVersion !== version && { adjustedVersion }), source: composerUrl(style) }
  })
  return json({ records, styles }, { headers: { 'cache-control': 'no-store' } })
}
