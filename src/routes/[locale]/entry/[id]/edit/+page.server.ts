import { error, fail, redirect } from '@sveltejs/kit'
import { fields, invalidFields, readEvidence } from '$lib/server/evidence'
import { publicEntryPredicate } from '$lib/server/visibility'
import { isLocale, localizedHref, t, type Locale } from '$lib/i18n'
import type { Actions, PageServerLoad } from './$types'

type FieldName = typeof fields[number]

function idOf(id: string) {
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) error(404)
  return Number(id)
}

function fieldErrors(locale: Locale, form: FormData) {
  const errors: Partial<Record<FieldName, string>> = {}
  for (const name of invalidFields(form)) {
    errors[name] = name === 'script' ? t(locale, 'error.script')
      : name === 'place' ? t(locale, 'error.placeSeen')
      : t(locale, 'error.length')
  }
  return errors
}

export const load: PageServerLoad = async ({ params, platform }) => {
  if (!isLocale(params.locale)) error(404)
  if (!platform) error(500, 'Database unavailable')
  const entry = await platform.env.DB.prepare(`SELECT id, revision, edit_generation, ${fields.join(', ')} FROM entries WHERE id = ? AND ${publicEntryPredicate}`).bind(idOf(params.id)).first()
  if (!entry) error(404)
  return { entry }
}

export const actions: Actions = {
  default: async ({ params, platform, request }) => {
    if (!isLocale(params.locale)) error(404)
    if (!platform) error(500, 'Database unavailable')
    const locale = params.locale
    const id = idOf(params.id)
    const form = await request.formData()
    const values = Object.fromEntries(fields.map(name => [name, typeof form.get(name) === 'string' ? form.get(name) : '']))
    const version = form.get('revision')
    const revision = typeof version === 'string' && /^[1-9]\d*$/.test(version) ? Number(version) : NaN
    const generationToken = form.get('edit_generation')
    const generation = typeof generationToken === 'string' && /^[1-9]\d*$/.test(generationToken) ? Number(generationToken) : NaN
    const row = readEvidence(form)
    const radical = String(form.get('radical') ?? '').normalize('NFC').trim().slice(0, 20) || null
    const encoded = String(form.get('encoded_as') ?? '').normalize('NFC').trim().slice(0, 80) || null
    // Visibility is checked before returning even submitted data for a hidden entry.
    const current = await platform.env.DB.prepare(`SELECT revision FROM entries WHERE id = ? AND ${publicEntryPredicate}`).bind(id).first<{ revision: number }>()
    if (!current) error(404)
    const errors = fieldErrors(locale, form)
    if (!Number.isSafeInteger(revision) || !Number.isSafeInteger(generation) || !row || Object.keys(errors).length) {
      return fail(400, { values, revision: version, generation: generationToken, errors, message: t(locale, 'error.fields') })
    }
    const updated = await platform.env.DB.prepare(`UPDATE entries SET ${fields.map(name => `${name} = ?`).join(', ')}, radical = ?, encoded_as = ?, revision = revision + 1 WHERE id = ? AND ${publicEntryPredicate} AND revision = ? AND edit_generation = ? RETURNING id`).bind(...fields.map(name => row[name]), radical, encoded, id, revision, generation).first()
    if (!updated) {
      const visible = await platform.env.DB.prepare(`SELECT revision FROM entries WHERE id = ? AND ${publicEntryPredicate}`).bind(id).first()
      if (!visible) error(404)
      return fail(409, { values, revision: version, generation: generationToken, errors, message: t(locale, 'edit.conflict') })
    }
    redirect(303, localizedHref(locale, `/entry/${id}`))
  },
}
