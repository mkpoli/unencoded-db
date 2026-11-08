import { error, fail, redirect } from '@sveltejs/kit'
import { fields, readEvidence, evidenceErrors } from '$lib/server/evidence'
import { readComparisons } from '$lib/server/related'
import type { Actions } from './$types'

export const actions: Actions = {
  default: async ({ request, platform }) => {
    if (!platform) error(500, 'Storage unavailable')
    const form = await request.formData()
    const values = Object.fromEntries(fields.map(name => [name, typeof form.get(name) === 'string' ? form.get(name) : '']))
    const errors = evidenceErrors(form)
    const row = readEvidence(form)
    const comparisons = readComparisons(form)
    if (!row || Object.keys(errors).length || comparisons.tooMany || comparisons.errors.some(Boolean)) {
      return fail(400, { errors, values, comparisons })
    }
    const result = await platform.env.DB.prepare(`INSERT INTO entries (${fields.join(', ')}, created_at, comparisons) VALUES (${fields.map(() => '?').join(', ')}, ?, ?) RETURNING id`).bind(...fields.map(name => row[name]), new Date().toISOString(), JSON.stringify(comparisons.rows)).first<{ id: number }>()
    if (!result) error(500, 'Could not save evidence')
    redirect(303, `/entry/${result.id}`)
  },
}
