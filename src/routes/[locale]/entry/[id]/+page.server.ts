import { error, fail, redirect } from '@sveltejs/kit'
import type { Comparison } from '$lib/comparison-rows'
import { MAX_COMPARISONS } from '$lib/server/related'
import { publicEntryPredicate } from '$lib/server/visibility'
import { addCrop, addEvidence, listCrops, listEvidence, readEvidenceFields } from '$lib/server/evidence-links'
import { genresForEntry } from '$lib/server/genres'
import { tagsForEntry } from '$lib/server/tags'
import { listSenses } from '$lib/server/senses'
import { collectionsForEntry } from '$lib/server/collections'
import { addRelation, listRelations } from '$lib/server/relation-graph'
import { createImageKey, putSourceImage, readSourceImage } from '$lib/server/images'
import { cookieOptions, hashToken } from '$lib/server/attribution'
import { glyphPaths, warmGlyphs } from '$lib/server/glyphs'
import { cleanIds } from '$lib/ids'
import { localizedHref, type Locale } from '$lib/i18n'
import type { PageServerLoad } from './$types'

type Entry = {
  id: number
  script: string
  ids: string | null
  description: string | null
  radical: string | null
  encoded_as: string | null
  strokes: number | null
  ivd_status: 'registered' | 'none' | null
  ivd_sequence: string | null
  created_at: string
  comparisons: string
}

export const load: PageServerLoad = async ({ params, platform, locals, url }) => {
  if (!platform) error(500, 'Database unavailable')
  if (!/^[1-9]\d*$/.test(params.id) || !Number.isSafeInteger(Number(params.id))) error(404)
  const row = await platform.env.DB.prepare(
    `SELECT id, script, ids, description, radical, encoded_as, strokes, ivd_status, ivd_sequence, created_at, comparisons
     FROM entries WHERE id = ? AND ${publicEntryPredicate}`
  ).bind(Number(params.id)).first<Entry>()
  if (!row) error(404)
  const { comparisons: stored, ...entry } = row
  const comparisons = JSON.parse(stored) as Comparison[]
  if (!Array.isArray(comparisons) || comparisons.length > MAX_COMPARISONS) error(500, 'Invalid related characters')
  const evidence = await listEvidence(platform.env.DB, Number(params.id))
  const crops = await listCrops(platform.env.DB, Number(params.id))
  const genres = await genresForEntry(platform.env.DB, Number(params.id))
  const collections = await collectionsForEntry(platform.env.DB, Number(params.id))
  const relations = await listRelations(platform.env.DB, Number(params.id))
  const tags = await tagsForEntry(platform.env.DB, Number(params.id))
  const senses = await listSenses(platform.env.DB, Number(params.id))
  const sequence = entry.ids ? cleanIds(entry.ids) : null
  const paths = await glyphPaths(platform.env.IMAGES, sequence ? [sequence] : [])
  const glyph = sequence ? paths[sequence] ?? null : null
  if (sequence && !glyph) platform.ctx?.waitUntil(warmGlyphs(platform.env.IMAGES, [sequence]))
  return { entry, glyph, comparisons, evidence, crops, genres, collections, relations, tags, senses, isModerator: Boolean(locals?.moderator), reported: url?.searchParams.get('reported') === '1' }
}

export const actions = {
  evidence: async ({ request, params, platform, cookies, url }) => {
    if (!platform) error(500, 'Storage unavailable')
    if (!/^[1-9]\d*$/.test(params.id) || !Number.isSafeInteger(Number(params.id))) error(404)
    const id = Number(params.id)
    const entry = await platform.env.DB.prepare(`SELECT id FROM entries WHERE id = ? AND ${publicEntryPredicate}`).bind(id).first<{ id: number }>()
    if (!entry) error(404)
    const form = await request.formData()
    const values = Object.fromEntries(['place', 'url', 'title', 'author', 'publisher', 'year', 'page', 'note'].map(name => [name, typeof form.get(name) === 'string' ? form.get(name) : '']))
    const fields = readEvidenceFields(form)
    if (!fields) return fail(400, { error: 'place', values })
    let image = null
    const file = form.get('image')
    if (file instanceof File && file.size) {
      const source = await readSourceImage(form)
      if (source.error || !source.image) return fail(400, { error: 'image', values })
      const key = createImageKey()
      try { await putSourceImage(platform.env.IMAGES, key, source.image) } catch { return fail(500, { error: 'save', values }) }
      image = { key, type: source.image.type, size: source.image.size }
    }
    const cookie = cookieOptions(url)
    const token = cookie ? cookies.get(cookie.name) : undefined
    const person = token && /^[0-9a-f]{64}$/.test(token)
      ? await platform.env.DB.prepare(`SELECT person_id FROM contributor_sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`).bind(await hashToken(token)).first<{ person_id: string }>()
      : null
    await addEvidence(platform.env.DB, id, fields, image, person?.person_id ?? null)
    redirect(303, localizedHref(params.locale as Locale, `/entry/${id}`))
  },
  crop: async ({ request, params, platform }) => {
    if (!platform) error(500, 'Storage unavailable')
    if (!/^[1-9]\d*$/.test(params.id)) error(404)
    const entryId = Number(params.id)
    const form = await request.formData()
    const evidenceId = Number(form.get('evidence'))
    if (!Number.isSafeInteger(evidenceId) || evidenceId <= 0) error(404)
    const visible = await platform.env.DB.prepare(`SELECT e.id FROM evidence e JOIN entries en ON en.id = e.entry_id AND ${publicEntryPredicate} WHERE e.id = ? AND e.entry_id = ?`).bind(evidenceId, entryId).first()
    if (!visible) error(404)
    const box = { x: Number(form.get('x')), y: Number(form.get('y')), w: Number(form.get('w')), h: Number(form.get('h')) }
    if (![box.x, box.y, box.w, box.h].every(Number.isFinite) || box.x < 0 || box.y < 0 || box.w <= 0 || box.h <= 0 || box.x + box.w > 100 || box.y + box.h > 100) return fail(400, { error: 'crop' })
    await addCrop(platform.env.DB, evidenceId, box)
    redirect(303, localizedHref(params.locale as Locale, `/entry/${entryId}`))
  },
  relation: async ({ request, params, platform }) => {
    if (!platform) error(500, 'Storage unavailable')
    if (!/^[1-9]\d*$/.test(params.id)) error(404)
    const id = Number(params.id)
    const entry = await platform.env.DB.prepare(`SELECT id FROM entries WHERE id = ? AND ${publicEntryPredicate}`).bind(id).first<{ id: number }>()
    if (!entry) error(404)
    const form = await request.formData()
    const target = String(form.get('target') ?? '').normalize('NFC').trim().slice(0, 80)
    const kind = String(form.get('kind') ?? '')
    const evidence = Number(form.get('evidence'))
    const difference = String(form.get('difference') ?? '').normalize('NFC').trim().slice(0, 5000) || null
    if (!target || !Number.isSafeInteger(evidence)) return fail(400, { error: 'relation' })
    const pair = await addRelation(platform.env.DB, id, target, kind, evidence, difference)
    if (!pair) return fail(400, { error: 'relation' })
    redirect(303, localizedHref(params.locale as Locale, `/entry/${id}`))
  },
}
