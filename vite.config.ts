import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

const WASM = new Set(['@resvg/resvg-wasm/index_bg.wasm', '@jsquash/webp/codec/dec/webp_dec.wasm', '@jsquash/webp/codec/enc/webp_enc.wasm', '@hyzyla/pdfium/pdfium.wasm'])

export default defineConfig({
  plugins: [{
    name: 'worker-wasm',
    enforce: 'pre',
    // Leave the precompiled module for Wrangler's Wasm loader.
    resolveId(id) {
      if (WASM.has(id)) return { id, external: true }
    },
  }, sveltekit()],
  // The IDS editor's data is fetched as gzip files, and each stays a file of its own.
  build: { assetsInlineLimit: 0 },
  // The composer's Worker resolves from its package, so both packages stay out of pre-bundling.
  optimizeDeps: { exclude: ['ids-input', 'han-compose'] },
  server: { fs: { allow: ['node_modules/ids-input', 'node_modules/han-compose'] } },
})
