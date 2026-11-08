import { methodNotAllowed, moderationPost } from '$lib/server/moderation'

export const POST = moderationPost('restore')
export const GET = methodNotAllowed
