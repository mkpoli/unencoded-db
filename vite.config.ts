import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [{
    name: 'worker-wasm',
    enforce: 'pre',
    // Leave the precompiled module for Wrangler's Wasm loader.
    resolveId(id) {
      if (id === '@resvg/resvg-wasm/index_bg.wasm' || id === '@jsquash/webp/codec/dec/webp_dec.wasm') return { id, external: true }
    },
  }, sveltekit()],
  // The IDS editor's data is fetched as gzip files, and each stays a file of its own.
  build: { assetsInlineLimit: 0 },
  // The composer's Worker resolves from its package, so both packages stay out of pre-bundling.
  optimizeDeps: { exclude: ['ids-input', 'han-compose'] },
  server: { fs: { allow: ['node_modules/ids-input', 'node_modules/han-compose'] } },
})
