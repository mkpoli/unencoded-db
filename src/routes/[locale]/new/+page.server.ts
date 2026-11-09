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
type FormErrors = Partial<Record<FieldName | 'image' | 'form', string>>

function fieldValues(form: FormData): Record<FieldName, string> {
  return Object.fromEntries(fields.map(name => {
    const value = form.get(name)
    return [name, typeof value === 'string' ? value : '']
  })) as Record<FieldName, string>
}

export const load: PageServerLoad = async ({ platform }) => {
  if (!platform) return { suggestions: [], genres: [], collections: [] }
  const { results } = await platform.env.DB.prepare(
    `SELECT ids, script FROM entries WHERE ${publicEntryPredicate} AND ids IS NOT NULL ORDER BY id DESC LIMIT 100`
  ).bind().all<{ ids: string; script: string }>()
  return { suggestions: results, genres: await listGenres(platform.env.DB), collections: await listCollections(platform.env.DB) }
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
    const source = await readSourceImage(form)
    if (source.error) errors.image = imageError(locale, source.error)
    const row = readEvidence(form)
    const comparisons = readComparisons(form)
    const genres = selectedGenres(form)
    const collections = selectedCollections(form)
    const failForm = (status: 400 | 500, errors: FormErrors) => fail(status, { errors, values: { ...values, genres, collections }, comparisons })
    if (!row || source.error || Object.keys(errors).length || comparisons.tooMany || comparisons.errors.some(Boolean)) return failForm(400, errors)
    if (!source.image) return failForm(400, { image: t(locale, 'error.imageMissing') })
    const image = source.image
    const cookie = cookieOptions(url)
    if (!cookie) error(403, 'Secure connection required')

    const key = createImageKey()
    try {
      await putSourceImage(platform.env.IMAGES, key, image)
    } catch {
      return failForm(500, { form: t(locale, 'error.save') })
    }

    let result: { id: number; token?: string }
    try {
      result = await saveEvidence(
        platform.env.DB,
        row,
        cookies.get(cookie.name),
        comparisons.rows,
        { key, type: image.type, size: image.size },
      )
    } catch (caught) {
      // A transport error can arrive before or after the insert commits. Recover
      // the row when it is visible; otherwise keep the object because a later
      // commit would leave a record pointing at a deleted image.
      const existing = await findEntryByImageKey(platform.env.DB, key)
      if (existing) redirect(303, localizedHref(locale, `/entry/${existing.id}`))
      if (caught instanceof DefinitiveSaveFailure && existing === null) await deleteSourceImage(platform.env.IMAGES, key)
      return failForm(500, { form: t(locale, 'error.save') })
    }

    const first = await addEvidence(platform.env.DB, result.id, { place: row.place, title: row.title, author: row.author, publisher: row.publisher, year: row.year, page: row.page, note: row.note }, { key, type: image.type, size: image.size }, null)
    await saveGenres(platform.env.DB, result.id, genres)
    await saveCollections(platform.env.DB, result.id, collections, first?.id ?? null)
    if (result.token) cookies.set(cookie.name, result.token, { ...sessionCookieSettings, secure: cookie.secure })
    redirect(303, localizedHref(locale, `/entry/${result.id}`))
  },
}
