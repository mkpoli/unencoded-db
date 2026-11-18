import { error } from '@sveltejs/kit'
import type { FontCatalogue } from '$lib/font-preview'
import type { PageLoad } from './$types'

export const load: PageLoad = async ({ fetch, depends, setHeaders }) => {
  depends('app:font-catalogue')
  setHeaders({ 'cache-control': 'no-store' })
  const response = await fetch('/api/font-export', { cache: 'no-store' })
  if (!response.ok) error(response.status, 'Font catalogue unavailable')
  return { catalogue: await response.json() as FontCatalogue }
}
