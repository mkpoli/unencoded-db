import { error, fail, redirect } from '@sveltejs/kit'
import { fields, readEvidence } from '$lib/server/evidence'
import { MAX_IMAGE, prepareImage, storeImage } from '$lib/server/image'
import type { Actions } from './$types'

export const actions: Actions = {
  default: async ({ request, platform }) => {
    if (!platform) error(500, 'Storage unavailable')
    const form = await request.formData()
    const values = Object.fromEntries(fields.map(name => [name, typeof form.get(name) === 'string' ? form.get(name) : '']))
    const errors: Partial<Record<typeof fields[number] | 'image', string>> = {}
    // Validate fields independently so a single submission can report every field error.
    for (const name of fields) {
      const probe = new FormData()
      probe.set('script', 'Han')
      probe.set('place', 'Source')
      probe.set('url', 'https://example.org/')
      const value = form.get(name)
      if (value !== null) probe.set(name, value)
      else probe.delete(name)
      if (!readEvidence(probe)) {
        errors[name] = name === 'script' ? 'Enter a script (up to 80 characters).'
          : name === 'url' ? 'Enter a valid HTTP or HTTPS URL (up to 1000 characters).'
          : 'Check the length of this field.'
      }
    }
    const row = readEvidence(form)
    if (!String(values.place).trim() && !String(values.url).trim()) errors.place = 'Enter a place or source URL.'
    const file = form.get('image')
    const hasFile = file instanceof File && file.size > 0
    const image = hasFile ? await prepareImage(file, MAX_IMAGE) : null
    if (hasFile && !image) errors.image = 'Image could not be accepted. Use a valid JPEG, PNG or WebP without EXIF, XMP or PNG text metadata, up to 15 MiB and 12000 pixels per side. Animated PNG and WebP are unsupported.'
    else if (!image && !String(values.url).trim()) errors.image = 'Provide an image or source URL.'
    if (!row || Object.keys(errors).length) return fail(400, { errors, values, reselectImage: hasFile })
    if (image) await storeImage(platform.env.MEDIA, image)
    const result = await platform.env.DB.prepare(`INSERT INTO entries (${fields.join(', ')}, image_key, created_at) VALUES (${fields.map(() => '?').join(', ')}, ?, ?) RETURNING id`).bind(...fields.map(name => row[name]), image?.key ?? null, new Date().toISOString()).first<{ id: number }>()
    if (!result) error(500, 'Could not save evidence')
    redirect(303, `/entry/${result.id}`)
  },
}
