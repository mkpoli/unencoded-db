// Worker entrypoint wrapping the SvelteKit build to expose the periodic Glyph Atlas evidence sync cron.
import site from './.svelte-kit/cloudflare/_worker.js'
import { uncachedWhenMissing } from './src/lib/server/build-files.ts'

export default {
  fetch: async (request, env, ctx) => uncachedWhenMissing(request, await site.fetch(request, env, ctx)),
  async scheduled(_controller, env, ctx) {
    if (env.WRITES_PAUSED === '1') return
    const token = crypto.randomUUID()
    const response = await site.fetch(
      new Request('https://rare.glyphatlas.org/api/sync/atlas', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: '{}',
      }),
      { ...env, ATLAS_SYNC_TOKEN: token },
      ctx,
    )
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      console.error('Scheduled Glyph Atlas evidence sync failed', response.status, detail.slice(0, 500))
    }
  },
}
