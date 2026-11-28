import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = (event) => {
  redirect(301, `/${event.params.locale}/radicals`)
}
