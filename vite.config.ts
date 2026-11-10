import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [sveltekit()],
  // The IDS editor's data is fetched as gzip files, and each stays a file of its own.
  build: { assetsInlineLimit: 0 },
  server: { fs: { allow: ['node_modules/ids-input'] } },
})
