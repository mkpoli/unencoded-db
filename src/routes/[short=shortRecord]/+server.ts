import { error } from '@sveltejs/kit'
import { recordCode } from '$lib/code'
import { LOCALE_COOKIE, negotiate } from '$lib/i18n'
import { readShortRecordCode } from '$lib/short-record'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = ({ params, cookies, request }) => {
  const id = readShortRecordCode(params.short)
  if (!id) error(404)
  const locale = negotiate(cookies.get(LOCALE_COOKIE), request.headers.get('accept-language'))
  return new Response(null, {
    status: 302,
    headers: {
      location: `/${locale}/${recordCode(id)}`,
      vary: 'Accept-Language, Cookie',
      'cache-control': 'private, no-store',
    },
  })
}
