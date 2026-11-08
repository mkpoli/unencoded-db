import { error, redirect } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { isLocale, localizedHref } from '$lib/i18n'
import { isSameOrigin, parseEntryId } from '$lib/server/moderation'
import { readReportForm } from '$lib/server/reports'
import { publicEntryPredicate } from '$lib/server/visibility'

function badRequest(): Response {
  return new Response('Invalid report.', { status: 400 })
}

function isReportRejection(cause: unknown): boolean {
  return cause instanceof Error && cause.message.includes('reports:')
}

export const POST: RequestHandler = async ({ params, request, platform, url }) => {
  if (!isLocale(params.locale)) error(404)
  if (!isSameOrigin(request, url)) return new Response('Forbidden', { status: 403 })

  const entryId = parseEntryId(params.id)
  if (entryId === null) error(404)
  if (!platform) error(500, 'Database unavailable')

  const entry = await platform.env.DB
    .prepare(`SELECT id FROM entries WHERE id = ? AND ${publicEntryPredicate}`)
    .bind(entryId)
    .first<{ id: number }>()
  if (!entry) error(404)

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return badRequest()
  }
  const report = readReportForm(form)
  if (!report) return badRequest()

  try {
    await platform.env.DB
      .prepare('INSERT INTO entry_reports (entry_id, reason, note, created_at) VALUES (?, ?, ?, ?)')
      .bind(entryId, report.reason, report.note, new Date().toISOString())
      .run()
  } catch (cause) {
    // A concurrent hide can make the visibility guard reject the insert.
    if (isReportRejection(cause)) {
      if (cause instanceof Error && cause.message.includes('too many open reports')) {
        return new Response('This record already has many open reports.', { status: 429, headers: { 'cache-control': 'no-store' } })
      }
      error(404)
    }
    throw cause
  }

  redirect(303, localizedHref(params.locale, `/entry/${entryId}?reported=1`))
}

export const GET: RequestHandler = () =>
  new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } })
