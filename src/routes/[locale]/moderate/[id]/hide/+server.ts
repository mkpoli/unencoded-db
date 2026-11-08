import { methodNotAllowed, moderationPost } from '$lib/server/moderation'

export const POST = moderationPost('hide')
export const GET = methodNotAllowed
