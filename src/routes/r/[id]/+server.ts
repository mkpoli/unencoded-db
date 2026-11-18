import { error } from '@sveltejs/kit'
import { LOCALE_COOKIE, negotiate } from '$lib/i18n'
import { positiveId } from '../../_submission.server'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = ({ params, cookies, request }) => {
  const id = positiveId(params.id)
  if (!id) error(404)
  const locale = negotiate(cookies.get(LOCALE_COOKIE), request.headers.get('accept-language'))
  return new Response(null, {
    status: 302,
    headers: {
      location: `/${locale}/entry/${id}`,
      vary: 'Accept-Language, Cookie',
      'cache-control': 'private, no-store',
    },
  })
}
