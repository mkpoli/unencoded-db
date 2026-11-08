import { redirect } from '@sveltejs/kit'
import { negotiateLocale } from '$lib/i18n'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = ({ request, url, setHeaders }) => {
  setHeaders({ vary: 'Accept-Language' })
  redirect(303, `/${negotiateLocale(request.headers.get('accept-language'))}${url.search}`)
}
