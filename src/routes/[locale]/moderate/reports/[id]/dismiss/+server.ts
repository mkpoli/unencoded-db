import { error, redirect } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { isLocale, localizedHref } from '$lib/i18n'
import { isSameOrigin, methodNotAllowed, parseEntryId } from '$lib/server/moderation'

function isDismissalRejection(cause: unknown): boolean {
  return cause instanceof Error && cause.message.includes('dismissals:')
}

export const POST: RequestHandler = async ({ params, request, platform, locals, url }) => {
  if (!isLocale(params.locale)) error(404)
  if (!locals.moderator) return new Response(null, { status: 404 })
  if (!isSameOrigin(request, url)) return new Response('Forbidden', { status: 403 })

  const reportId = parseEntryId(params.id)
  if (reportId === null) error(404)
  if (!platform) error(500, 'Database unavailable')

  try {
    await platform.env.DB
      .prepare('INSERT INTO report_dismissals (report_id, moderator, dismissed_at) VALUES (?, ?, ?)')
      .bind(reportId, locals.moderator, new Date().toISOString())
      .run()
  } catch (cause) {
    if (isDismissalRejection(cause)) {
      error(409, 'The report changed before it could be dismissed. Reload the queue.')
    }
    throw cause
  }

  redirect(303, localizedHref(params.locale, '/moderate/reports'))
}

export const GET = methodNotAllowed
