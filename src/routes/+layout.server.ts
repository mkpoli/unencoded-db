import { favouriteIds } from '$lib/server/favourites'
import { unreadCount } from '$lib/server/notifications'

// Read again on every navigation, so the reader's settings follow the cookie when another tab changes it.
export const load = async ({ locals, platform, url }) => {
  void url.href
  const db = platform?.env.DB
  return {
    person: locals.person ? { id: locals.person.id, name: locals.person.name, atlas: locals.person.atlas, moderator: locals.person.moderator } : null,
    favourites: locals.person && db ? (await favouriteIds(db, locals.person.id)).ids : [],
    unread: locals.person && db ? await unreadCount(db, locals.person.id) : 0,
    theme: locals.theme,
    glyphStyle: locals.glyphStyle,
    tileSize: locals.tileSize,
    signIn: Boolean(platform?.env.ATLAS_ISSUER && platform.env.ATLAS_CLIENT_ID && platform.env.ATLAS_CLIENT_SECRET),
  }
}
