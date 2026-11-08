import { error } from '@sveltejs/kit'
import { isLocale } from '$lib/i18n'
import type { LayoutServerLoad } from './$types'

export const load: LayoutServerLoad = ({ params }) => {
  if (!isLocale(params.locale)) error(404)
  return { locale: params.locale }
}
