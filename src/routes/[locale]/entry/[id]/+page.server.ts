import { error, fail, redirect } from '@sveltejs/kit'
import { MAX_COMPARISONS, type Comparison } from '$lib/server/related'
import { publicEntryPredicate } from '$lib/server/visibility'
import { addEvidence, listEvidence, readEvidenceFields } from '$lib/server/evidence-links'
import { genresForEntry } from '$lib/server/genres'
import { collectionsForEntry } from '$lib/server/collections'
import { createImageKey, putSourceImage, readSourceImage } from '$lib/server/images'
import { cookieOptions, hashToken } from '$lib/server/attribution'
import { localizedHref, type Locale } from '$lib/i18n'
import type { PageServerLoad } from './$types'

type Entry = {
  id: number
  script: string
  ids: string | null
  description: string | null
  place: string
  title: string | null
  author: string | null
  publisher: string | null
  year: string | null
  page: string | null
  note: string | null
  created_at: string
  has_image: number
  comparisons: string
}

export const load: PageServerLoad = async ({ params, platform, locals, url }) => {
  if (!platform) error(500, 'Database unavailable')
  if (!/^[1-9]\d*$/.test(params.id) || !Number.isSafeInteger(Number(params.id))) error(404)
  const row = await platform.env.DB.prepare(
    `SELECT id, script, ids, description, place, title, author, publisher, year, page, note, created_at,
            (image_key IS NOT NULL AND image_type IS NOT NULL) AS has_image, comparisons
     FROM entries WHERE id = ? AND ${publicEntryPredicate}`
  ).bind(Number(params.id)).first<Entry>()
  if (!row) error(404)
  const { comparisons: stored, ...entry } = row
  const comparisons = JSON.parse(stored) as Comparison[]
  if (!Array.isArray(comparisons) || comparisons.length > MAX_COMPARISONS) error(500, 'Invalid related characters')
  const evidence = await listEvidence(platform.env.DB, Number(params.id))
  const genres = await genresForEntry(platform.env.DB, Number(params.id))
  const collections = await collectionsForEntry(platform.env.DB, Number(params.id))
  return { entry, comparisons, evidence, genres, collections, isModerator: Boolean(locals?.moderator), reported: url?.searchParams.get('reported') === '1' }
}

export const actions = {
  evidence: async ({ request, params, platform, cookies, url }) => {
    if (!platform) error(500, 'Storage unavailable')
    if (!/^[1-9]\d*$/.test(params.id) || !Number.isSafeInteger(Number(params.id))) error(404)
    const id = Number(params.id)
    const entry = await platform.env.DB.prepare(`SELECT id FROM entries WHERE id = ? AND ${publicEntryPredicate}`).bind(id).first<{ id: number }>()
    if (!entry) error(404)
    const form = await request.formData()
    const values = Object.fromEntries(['place', 'title', 'author', 'publisher', 'year', 'page', 'note'].map(name => [name, typeof form.get(name) === 'string' ? form.get(name) : '']))
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
}
