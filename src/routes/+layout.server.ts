import type { LayoutServerLoad } from './$types'

export const load: LayoutServerLoad = ({ locals }) => ({ isModerator: locals.moderator !== null })
