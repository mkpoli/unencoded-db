import { error, fail, redirect } from '@sveltejs/kit'
import { DefinitiveSaveFailure, cookieOptions, saveEvidence, sessionCookieSettings } from '$lib/server/attribution'
import type { Evidence } from '$lib/server/evidence'
import { addEvidence } from '$lib/server/evidence-links'
import { createImageKey, deleteSourceImage, putSourceImage, readSourceImage } from '$lib/server/images'
import { isLocale, localizedHref, t } from '$lib/i18n'
import type { Actions } from './$types'

const MAX_ROWS = 20

function rows(form: FormData): Evidence[] | null {
  const scripts = form.getAll('script')
  const ids = form.getAll('ids')
  const descriptions = form.getAll('description')
  const count = Math.max(scripts.length, ids.length, descriptions.length)
  if (count < 1 || count > MAX_ROWS) return null
  const out: Evidence[] = []
  for (let i = 0; i < count; i++) {
    const rawScript = scripts[i], rawIds = ids[i], rawDescription = descriptions[i]
    const script = typeof rawScript === 'string' ? rawScript.trim() : ''
    const sequence = typeof rawIds === 'string' ? rawIds.trim() : ''
    const description = typeof rawDescription === 'string' ? rawDescription.trim() : ''
    if (!script || script.length > 80 || sequence.length > 200 || description.length > 5000) return null
    out.push({ script, ids: sequence || null, description: description || null, place: '', title: null, author: null, publisher: null, year: null, page: null, note: null })
  }
  return out
}

export const actions: Actions = {
  default: async ({ request, platform, params, url, cookies }) => {
    if (!isLocale(params.locale)) error(404)
    if (!platform) error(500, 'Storage unavailable')
    const form = await request.formData()
    const entries = rows(form)
    if (!entries) return fail(400, { error: 'rows' })
    const place = String(form.get('place') ?? '').trim()
    if (!place || place.length > 500) return fail(400, { error: 'place' })
    const title = String(form.get('title') ?? '').trim().slice(0, 300) || null
    const author = String(form.get('author') ?? '').trim().slice(0, 300) || null
    const publisher = String(form.get('publisher') ?? '').trim().slice(0, 300) || null
    const year = String(form.get('year') ?? '').trim().slice(0, 40) || null
    const page = String(form.get('page') ?? '').trim().slice(0, 80) || null
    const source = await readSourceImage(form)
    if (source.error || !source.image) return fail(400, { error: 'image' })
    const cookie = cookieOptions(url)
    if (!cookie) error(403, 'Secure connection required')
    const key = createImageKey()
    try { await putSourceImage(platform.env.IMAGES, key, source.image) } catch { return fail(500, { error: 'save' }) }
    let token = cookies.get(cookie.name)
    let first: number | null = null
    for (const row of entries) {
      let result: { id: number; token?: string }
      try {
        result = await saveEvidence(platform.env.DB, { ...row, place, title, author, publisher, year, page }, token, [], { key, type: source.image.type, size: source.image.size })
      } catch (caught) {
        if (caught instanceof DefinitiveSaveFailure && first === null) await deleteSourceImage(platform.env.IMAGES, key)
        return fail(500, { error: 'save' })
      }
      token = result.token ?? token
      first ??= result.id
      await addEvidence(platform.env.DB, result.id, { place, title, author, publisher, year, page, note: null }, { key, type: source.image.type, size: source.image.size }, null)
    }
    if (!first) return fail(500, { error: 'save' })
    if (token) cookies.set(cookie.name, token, { ...sessionCookieSettings, secure: cookie.secure })
    redirect(303, localizedHref(params.locale, `/entry/${first}`))
  },
}
