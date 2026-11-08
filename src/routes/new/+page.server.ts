import { error, fail, redirect } from '@sveltejs/kit'
import { fields, readEvidence } from '$lib/server/evidence'
import { cookieOptions, saveEvidence, sessionCookieSettings } from '$lib/server/attribution'
import { readComparisons } from '$lib/server/related'
import type { Actions } from './$types'

export const actions: Actions = {
  default: async ({ request, platform, url, cookies }) => {
    if (!platform) error(500, 'Storage unavailable')
    const form = await request.formData()
    const values = Object.fromEntries(fields.map(name => [name, typeof form.get(name) === 'string' ? form.get(name) : '']))
    const errors: Partial<Record<typeof fields[number], string>> = {}
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
    const comparisons = readComparisons(form)
    if (!row || Object.keys(errors).length || comparisons.tooMany || comparisons.errors.some(Boolean)) {
      return fail(400, { errors, values, comparisons })
    }
    const cookie = cookieOptions(url)
    if (!cookie) error(403, 'Secure connection required')
    const result = await saveEvidence(platform.env.DB, row, cookies.get(cookie.name), comparisons.rows)
    if (result.token) cookies.set(cookie.name, result.token, { ...sessionCookieSettings, secure: cookie.secure })
    redirect(303, `/entry/${result.id}`)
  },
}
