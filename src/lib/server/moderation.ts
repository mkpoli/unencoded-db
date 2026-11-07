import { error, redirect } from '@sveltejs/kit'
import type { RequestHandler } from '@sveltejs/kit'

export type ModerationAction = 'hide' | 'restore'

export function parseEntryId(raw: string | undefined): number | null {
  if (!raw || !/^[1-9]\d*$/.test(raw)) return null
  const id = Number(raw)
  return Number.isSafeInteger(id) ? id : null
}

export function isSameOrigin(request: Request, url: URL): boolean {
  const origin = request.headers.get('origin')
  return origin !== null && origin === url.origin
}

function isTriggerRejection(cause: unknown): boolean {
  return cause instanceof Error && cause.message.includes('moderation:')
}

async function recordModeration(db: D1Database, entryId: number, action: ModerationAction, moderator: string): Promise<void> {
  try {
    await db
      .prepare('INSERT INTO moderation_audit (entry_id, action, moderator, created_at) VALUES (?, ?, ?, ?)')
      .bind(entryId, action, moderator, new Date().toISOString())
      .run()
  } catch (cause) {
    if (isTriggerRejection(cause)) error(409, 'The entry changed before this action could be applied. Reload the queue.')
    throw cause
  }
}

export const methodNotAllowed: RequestHandler = () =>
  new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } })

export function moderationPost(action: ModerationAction): RequestHandler {
  return async ({ params, request, platform, locals, url }) => {
    if (!locals.moderator) return new Response(null, { status: 404 })
    if (!isSameOrigin(request, url)) return new Response('Forbidden', { status: 403 })

    const entryId = parseEntryId(params.id)
    if (entryId === null) error(404)
    if (!platform) error(500, 'Database unavailable')

    await recordModeration(platform.env.DB, entryId, action, locals.moderator)
    redirect(303, '/moderate')
  }
}
