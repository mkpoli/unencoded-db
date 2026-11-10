import { error, fail, redirect } from '@sveltejs/kit'
import { fields, invalidFields, readEvidence } from '$lib/server/evidence'
import { DefinitiveSaveFailure, cookieOptions, saveEvidence, sessionCookieSettings } from '$lib/server/attribution'
import { createImageKey, deleteSourceImage, putSourceImage, readSourceImage, type ImageError } from '$lib/server/images'
import { isLocale, localizedHref, t, type Locale } from '$lib/i18n'
import { readComparisons } from '$lib/server/related'
import { addEvidence } from '$lib/server/evidence-links'
import { listGenres, saveGenres, selectedGenres } from '$lib/server/genres'
import { listCollections, saveCollections, selectedCollections } from '$lib/server/collections'
import { publicEntryPredicate } from '$lib/server/visibility'
import { listTags, parseTags, saveTags } from '$lib/server/tags'
import { parseSenses, saveSenses } from '$lib/server/senses'
import { readIvd } from '$lib/server/ivd'
import { cleanSourceUrl } from '$lib/source-url'
import type { Actions, PageServerLoad } from './$types'

function imageError(locale: Locale, error: ImageError): string {
  switch (error) {
    case 'oversize': return t(locale, 'error.imageOversize')
    default: return t(locale, 'error.imageUnsupported')
  }
}

async function findEntryByImageKey(db: D1Database, key: string): Promise<{ id: number } | null | undefined> {
  try {
    return await db.prepare('SELECT id FROM entries WHERE image_key = ?').bind(key).first<{ id: number }>() ?? null
  } catch {
    return undefined
  }
}
type FieldName = typeof fields[number]
type FormErrors = Partial<Record<FieldName | 'image' | 'form' | 'url' | 'provider' | 'provider_url' | 'ivd_sequence' | 'comparison', string>>

function fieldValues(form: FormData): Record<FieldName, string> {
  return Object.fromEntries(fields.map(name => {
    const value = form.get(name)
    return [name, typeof value === 'string' ? value : '']
  })) as Record<FieldName, string>
}

export const load: PageServerLoad = async ({ platform }) => {
  if (!platform) return { suggestions: [], genres: [], collections: [], tags: [] }
  const { results } = await platform.env.DB.prepare(
    `SELECT ids, script FROM entries WHERE ${publicEntryPredicate} AND ids IS NOT NULL ORDER BY id DESC LIMIT 100`
  ).bind().all<{ ids: string; script: string }>()
  return { suggestions: results, genres: await listGenres(platform.env.DB), collections: await listCollections(platform.env.DB), tags: await listTags(platform.env.DB) }
}

export const actions: Actions = {
  default: async ({ request, platform, params, url, cookies }) => {
    if (!isLocale(params.locale)) error(404)
    if (!platform) error(500, 'Storage unavailable')
    const locale = params.locale
    const form = await request.formData()
    const values = fieldValues(form)
    const errors: FormErrors = {}
    const rawProvider = String(form.get('provider') ?? '').normalize('NFC').trim()
    const rawProviderUrl = String(form.get('provider_url') ?? '').normalize('NFC').trim()
    const rawLink = cleanSourceUrl(String(form.get('url') ?? '').normalize('NFC').trim())
    if (rawProvider.length > 300) errors.provider = t(locale, 'error.length')
    if (rawProviderUrl.length > 1000 || (rawProviderUrl && !/^https?:\/\//i.test(rawProviderUrl))) errors.provider_url = t(locale, 'error.length')
    if (rawLink.length > 1000 || (rawLink && !/^https?:\/\//i.test(rawLink))) errors.url = t(locale, 'error.length')
    const provider = rawProvider.slice(0, 300) || null
    const providerUrl = rawProviderUrl.slice(0, 1000) || null
    const link = rawLink.slice(0, 1000) || null
    const hasProviderLink = Boolean(provider && (providerUrl || link) && !errors.provider && !errors.provider_url && !errors.url)
    for (const name of invalidFields(form)) {
      if (name === 'place' && hasProviderLink && !values.place.trim()) continue
      errors[name] = name === 'script' ? t(locale, 'error.script')
        : name === 'place' ? t(locale, 'error.placeSeen')
        : t(locale, 'error.length')
    }
    if (!values.ids.trim()) errors.ids = t(locale, 'error.ids')
    const source = await readSourceImage(form)
    if (source.error && source.error !== 'missing') errors.image = imageError(locale, source.error)
    let row = readEvidence(form)
    if (!row && hasProviderLink && !values.place.trim()) {
      const fallback = new FormData()
      for (const [k, v] of form.entries()) fallback.append(k, v)
      fallback.set('place', '_')
      const parsed = readEvidence(fallback)
      if (parsed) row = { ...parsed, place: '' }
    }
    const radical = String(form.get('radical') ?? '').normalize('NFC').trim().slice(0, 20) || null
    const encoded = String(form.get('encoded_as') ?? '').normalize('NFC').trim().slice(0, 80) || null
    const ivdStatus = typeof form.get('ivd_status') === 'string' ? form.get('ivd_status') as string : ''
    const ivdSequence = typeof form.get('ivd_sequence') === 'string' ? form.get('ivd_sequence') as string : ''
    const ivd = readIvd(form.get('ivd_status'), form.get('ivd_sequence'))
    if (!ivd) errors.ivd_sequence = t(locale, 'error.ivd')
    const rawStrokes = Number.parseInt(String(form.get('strokes') ?? ''), 10)
    const strokes = Number.isInteger(rawStrokes) && rawStrokes >= 0 && rawStrokes < 200 ? rawStrokes : null
    const comparisons = readComparisons(form)
    if (comparisons.invalid) errors.comparison = t(locale, 'error.comparison')
    const genres = selectedGenres(form)
    const collections = selectedCollections(form)
    const tags = parseTags(String(form.get('tags') ?? ''))
    const senses = parseSenses(form)
    const submitted = { ...values, provider: rawProvider, provider_url: rawProviderUrl, radical, encoded_as: encoded, strokes, ivd_status: ivdStatus, ivd_sequence: ivdSequence, genres, collections, tags: tags.join(', ') }
    if (!senses) return fail(400, { errors, values: submitted, comparisons })
    const failForm = (status: 400 | 500, errors: FormErrors) => fail(status, { errors, values: submitted, comparisons })
    if (link && !/^https?:\/\//i.test(link)) errors.url = t(locale, 'error.length')
    if (!ivd || !row || (source.error && source.error !== 'missing') || Object.keys(errors).length) return failForm(400, errors)
    const image = source.error === 'missing' ? null : source.image
    const cookie = cookieOptions(url)
    if (!cookie) error(403, 'Secure connection required')

    let key: string | null = null
    let imageMeta: { key: string; type: string; size: number } | null = null
    if (image) {
      key = createImageKey()
      try {
        await putSourceImage(platform.env.IMAGES, key, image)
        imageMeta = { key, type: image.type, size: image.size }
      } catch {
        return failForm(500, { form: t(locale, 'error.save') })
      }
    }

    let duplicate: { id: number } | null = null
    if (row.ids) {
      try {
        duplicate = await platform.env.DB.prepare(`SELECT id FROM entries WHERE script = ? AND ids = ? AND ${publicEntryPredicate} ORDER BY id LIMIT 1`).bind(row.script, row.ids).first<{ id: number }>()
      } catch {
        duplicate = null
      }
    }
    if (duplicate) {
      await addEvidence(platform.env.DB, duplicate.id, { place: row.place, url: link, provider, provider_url: providerUrl, title: row.title, author: row.author, publisher: row.publisher, year: row.year, page: row.page, note: row.note }, imageMeta, null)
      redirect(303, localizedHref(locale, `/entry/${duplicate.id}`))
    }

    let result: { id: number; token?: string }
    try {
      result = await saveEvidence(
        platform.env.DB,
        row,
        cookies.get(cookie.name),
        comparisons.rows,
        imageMeta ?? undefined,
        { radical, encoded_as: encoded, strokes, ivd_status: ivd.status, ivd_sequence: ivd.sequence },
      )
    } catch (caught) {
      // A transport error can arrive before or after the insert commits. Recover
      // the row when it is visible; otherwise keep the object because a later
      // commit would leave a record pointing at a deleted image.
      const existing = key ? await findEntryByImageKey(platform.env.DB, key) : null
      if (existing) redirect(303, localizedHref(locale, `/entry/${existing.id}`))
      if (key && caught instanceof DefinitiveSaveFailure && existing === null) await deleteSourceImage(platform.env.IMAGES, key)
      return failForm(500, { form: t(locale, 'error.save') })
    }

    const first = await addEvidence(platform.env.DB, result.id, { place: row.place, url: link, provider, provider_url: providerUrl, title: row.title, author: row.author, publisher: row.publisher, year: row.year, page: row.page, note: row.note }, imageMeta, null)
    await saveGenres(platform.env.DB, result.id, genres)
    await saveCollections(platform.env.DB, result.id, collections, first?.id ?? null)
    await saveTags(platform.env.DB, result.id, tags)
    await saveSenses(platform.env.DB, result.id, senses, first?.id ?? null)
    if (result.token) cookies.set(cookie.name, result.token, { ...sessionCookieSettings, secure: cookie.secure })
    redirect(303, localizedHref(locale, `/entry/${result.id}`))
  },
}
