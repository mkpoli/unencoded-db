import adapter from '@sveltejs/adapter-cloudflare'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

export default {
  preprocess: vitePreprocess(),
  compilerOptions: { runes: true },
  // The origin of a form post is checked in `src/hooks.server.ts`, which lets the OAuth token endpoints through:
  // a client posts a form to them from outside any browser.
  kit: { adapter: adapter({ config: 'site.wrangler.jsonc', platformProxy: { configPath: 'wrangler.jsonc' } }), version: { pollInterval: 5 * 60 * 1000 }, csrf: { trustedOrigins: ['*'] } },
}
