import { error, fail, redirect } from '@sveltejs/kit'
import { fields, readEvidence } from '$lib/server/evidence'
import { createImageKey, deleteSourceImage, putSourceImage, readSourceImage } from '$lib/server/images'
import type { Actions } from './$types'

const SAVE_FAILED = 'Could not save the record. Try again.'

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

export const actions: Actions = {
  default: async ({ request, platform }) => {
    if (!platform) error(500, 'Storage unavailable')
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
        errors[name] = name === 'script' ? 'Enter a script (up to 80 characters).'
          : name === 'place' ? 'Enter where the character was seen (up to 500 characters).'
          : 'Check the length of this field.'
      }
    }
    const source = await readSourceImage(form)
    if (source.error) errors.image = source.error
    const row = readEvidence(form)
    const failForm = (status: 400 | 500, errors: FormErrors) => fail(status, { errors, values })
    if (!row || source.error || Object.keys(errors).length) return failForm(400, errors)
    if (!source.image) return failForm(400, { image: 'Choose a source image.' })
    const image = source.image

    const key = createImageKey()
    try {
      await putSourceImage(platform.env.IMAGES, key, image)
    } catch {
      return failForm(500, { form: SAVE_FAILED })
    }

    let result: { id: number } | null = null
    try {
      result = await platform.env.DB.prepare(
        `INSERT INTO entries (${fields.join(', ')}, image_key, image_type, image_size, created_at) VALUES (${fields.map(() => '?').join(', ')}, ?, ?, ?, ?) RETURNING id`
      ).bind(...fields.map(name => row[name]), key, image.type, image.size, new Date().toISOString()).first<{ id: number }>()
    } catch {
      // A transport error can arrive after the insert committed. Look for the
      // row before deleting its image; leave an orphan if the lookup fails.
      const existing = await findEntryByImageKey(platform.env.DB, key)
      if (existing) redirect(303, `/entry/${existing.id}`)
      if (existing === null) await deleteSourceImage(platform.env.IMAGES, key)
      return failForm(500, { form: SAVE_FAILED })
    }
    if (!result) {
      const existing = await findEntryByImageKey(platform.env.DB, key)
      if (existing) redirect(303, `/entry/${existing.id}`)
      if (existing === null) await deleteSourceImage(platform.env.IMAGES, key)
      return failForm(500, { form: SAVE_FAILED })
    }
    redirect(303, `/entry/${result.id}`)
  },
}
