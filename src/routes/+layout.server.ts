// Read again on every navigation, so the reader's settings follow the cookie when another tab changes it.
export const load = ({ locals, platform, url }) => (void url.href, {
  person: locals.person ? { id: locals.person.id, name: locals.person.name, atlas: locals.person.atlas, moderator: locals.person.moderator } : null,
  theme: locals.theme,
  glyphStyle: locals.glyphStyle,
  signIn: Boolean(platform?.env.ATLAS_ISSUER && platform.env.ATLAS_CLIENT_ID && platform.env.ATLAS_CLIENT_SECRET),
})
