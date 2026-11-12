import { error, redirect } from '@sveltejs/kit'
import { isLocale } from '$lib/i18n'
import { endSession, sessionName } from '$lib/server/people'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async event => {
  if (event.request.headers.get('origin') !== event.url.origin) error(403, 'Invalid origin')
  const db = event.platform?.env.DB
  if (!db) error(503, 'Sign-out unavailable')
  await endSession(db, event.cookies.get(sessionName(event)))
  event.cookies.delete(sessionName(event), { path: '/', secure: event.url.protocol === 'https:' })
  const locale = event.url.searchParams.get('locale')
  redirect(303, `/${locale && isLocale(locale) ? locale : 'en'}/me`)
}
