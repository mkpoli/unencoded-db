import { error, fail, redirect } from '@sveltejs/kit'
import { fields, readEvidence } from '$lib/server/evidence'
import { createImageKey, deleteSourceImage, putSourceImage, readSourceImage, type ImageError } from '$lib/server/images'
import { isLocale, localizedHref, t, type Locale } from '$lib/i18n'
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
  if (!platform) return { suggestions: [] }
  const { results } = await platform.env.DB.prepare(
    `SELECT ids, script FROM entries WHERE ${publicEntryPredicate} AND ids IS NOT NULL ORDER BY id DESC LIMIT 100`
  ).bind().all<{ ids: string; script: string }>()
  return { suggestions: results }
}

export const actions: Actions = {
  default: async ({ request, platform, params }) => {
    if (!isLocale(params.locale)) error(404)
    if (!platform) error(500, 'Storage unavailable')
    const locale = params.locale
    const form = await request.formData()
    const values = fieldValues(form)
    const errors: FormErrors = {}
    // Validate fields independently so a single submission can report every field error.
    for (const name of fields) {
      const probe = new FormData()
      probe.set('script', 'Han')
      probe.set('place', 'Source')
      const value = form.get(name)
      if (value !== null) probe.set(name, value)
      else probe.delete(name)
      if (!readEvidence(probe)) {
        errors[name] = name === 'script' ? t(locale, 'error.script')
          : name === 'place' ? t(locale, 'error.placeSeen')
          : t(locale, 'error.length')
      }
    }
    const source = await readSourceImage(form)
    if (source.error) errors.image = imageError(locale, source.error)
    const row = readEvidence(form)
    const failForm = (status: 400 | 500, errors: FormErrors) => fail(status, { errors, values })
    if (!row || source.error || Object.keys(errors).length) return failForm(400, errors)
    if (!source.image) return failForm(400, { image: t(locale, 'error.imageMissing') })
    const image = source.image

    const key = createImageKey()
    try {
      await putSourceImage(platform.env.IMAGES, key, image)
    } catch {
      return failForm(500, { form: t(locale, 'error.save') })
    }

    let result: { id: number } | null = null
    try {
      result = await platform.env.DB.prepare(
        `INSERT INTO entries (${fields.join(', ')}, image_key, image_type, image_size, created_at) VALUES (${fields.map(() => '?').join(', ')}, ?, ?, ?, ?) RETURNING id`
      ).bind(...fields.map(name => row[name]), key, image.type, image.size, new Date().toISOString()).first<{ id: number }>()
    } catch {
      // A transport error can arrive before or after the insert commits.
      // Recover the row when it is visible and otherwise keep the object: a
      // later commit would leave a record with a deleted image.
      const existing = await findEntryByImageKey(platform.env.DB, key)
      if (existing) redirect(303, localizedHref(locale, `/entry/${existing.id}`))
      return failForm(500, { form: t(locale, 'error.save') })
    }
    if (!result) {
      const existing = await findEntryByImageKey(platform.env.DB, key)
      if (existing) redirect(303, localizedHref(locale, `/entry/${existing.id}`))
      if (existing === null) await deleteSourceImage(platform.env.IMAGES, key)
      return failForm(500, { form: t(locale, 'error.save') })
    }
    redirect(303, localizedHref(locale, `/entry/${result.id}`))
  },
}
