import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

// Any other path under a valid locale is a localized 404 instead of the English root error.
export const load: PageServerLoad = () => {
  error(404)
}
