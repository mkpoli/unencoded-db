import { error, fail, redirect } from '@sveltejs/kit'
import { fields, invalidFields, isHttpUrl, readEvidence } from '$lib/server/evidence'
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
import type { Actions, PageServerLoad } from './$types'

function imageError(locale: Locale, error: ImageError): string {
  switch (error) {
    case 'missing': return t(locale, 'error.imageMissing')
    case 'empty': return t(locale, 'error.imageEmpty')
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
type FormErrors = Partial<Record<FieldName | 'image' | 'url' | 'form', string>>

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
    for (const name of invalidFields(form)) {
      errors[name] = name === 'script' ? t(locale, 'error.script')
        : name === 'place' ? t(locale, 'error.placeSeen')
        : t(locale, 'error.length')
    }
    const site = String(form.get('url') ?? '').normalize('NFC').trim().slice(0, 1000) || null
    if (site && !isHttpUrl(site)) errors.url = t(locale, 'error.url')
    // An image is one kind of source: a link or a citation alone is enough.
    const file = form.get('image')
    const source = file instanceof File ? await readSourceImage(form) : null
    if (source?.error) errors.image = imageError(locale, source.error)
    const row = readEvidence(form)
    const radical = String(form.get('radical') ?? '').normalize('NFC').trim().slice(0, 20) || null
    const encoded = String(form.get('encoded_as') ?? '').normalize('NFC').trim().slice(0, 80) || null
    const comparisons = readComparisons(form)
    const genres = selectedGenres(form)
    const collections = selectedCollections(form)
    const tags = parseTags(String(form.get('tags') ?? ''))
    const senses = parseSenses(form)
    if (!senses) return fail(400, { errors, values: { ...values, genres, collections, tags: tags.join(', '), url: site ?? '' }, comparisons })
    const failForm = (status: 400 | 500, errors: FormErrors) => fail(status, { errors, values: { ...values, genres, collections, tags: tags.join(', '), url: site ?? '' }, comparisons })
    if (!row || source?.error || Object.keys(errors).length || comparisons.tooMany || comparisons.errors.some(Boolean)) return failForm(400, errors)
    const image = source?.image ?? null
    const cookie = cookieOptions(url)
    if (!cookie) error(403, 'Secure connection required')

    const key = image ? createImageKey() : null
    if (image && key) {
      try {
        await putSourceImage(platform.env.IMAGES, key, image)
      } catch {
        return failForm(500, { form: t(locale, 'error.save') })
      }
    }

    let result: { id: number; token?: string }
    try {
      result = await saveEvidence(
        platform.env.DB,
        row,
        cookies.get(cookie.name),
        comparisons.rows,
        image && key ? { key, type: image.type, size: image.size } : undefined,
        { radical, encoded_as: encoded },
      )
    } catch (caught) {
      // A transport error can arrive before or after the insert commits. Recover
      // the row when it is visible; otherwise keep the object because a later
      // commit would leave a record pointing at a deleted image.
      if (key) {
        const existing = await findEntryByImageKey(platform.env.DB, key)
        if (existing) redirect(303, localizedHref(locale, `/entry/${existing.id}`))
        if (caught instanceof DefinitiveSaveFailure && existing === null) await deleteSourceImage(platform.env.IMAGES, key)
      }
      return failForm(500, { form: t(locale, 'error.save') })
    }

    const first = await addEvidence(platform.env.DB, result.id, { place: row.place, title: row.title, author: row.author, publisher: row.publisher, year: row.year, page: row.page, note: row.note, url: site }, image && key ? { key, type: image.type, size: image.size } : null, null)
    await saveGenres(platform.env.DB, result.id, genres)
    await saveCollections(platform.env.DB, result.id, collections, first?.id ?? null)
    await saveTags(platform.env.DB, result.id, tags)
    await saveSenses(platform.env.DB, result.id, senses, first?.id ?? null)
    if (result.token) cookies.set(cookie.name, result.token, { ...sessionCookieSettings, secure: cookie.secure })
    redirect(303, localizedHref(locale, `/entry/${result.id}`))
  },
}
