export const load = ({ locals, platform }) => ({
  person: locals.person ? { id: locals.person.id, name: locals.person.name, atlas: locals.person.atlas, moderator: locals.person.moderator } : null,
  theme: locals.theme,
  signIn: Boolean(platform?.env.ATLAS_ISSUER && platform.env.ATLAS_CLIENT_ID && platform.env.ATLAS_CLIENT_SECRET),
})
