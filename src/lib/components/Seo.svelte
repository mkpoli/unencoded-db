<script lang="ts">
  import { page } from '$app/state'
  import { t } from '$lib/t'
  let { title, description, image }: { title?: string; description?: string; image?: string | null } = $props()
  const full = $derived(title ? `${title} · ${t('app.name')}` : `${t('app.name')} · ${t('app.tagline')}`)
  const text = $derived(description ?? t('app.description'))
</script>

<svelte:head>
  <title>{full}</title>
  <meta name="description" content={text} />
  <meta property="og:title" content={full} />
  <meta property="og:site_name" content={t('app.name')} />
  <meta property="og:description" content={text} />
  <meta property="og:type" content="website" />
  {#if image}<meta property="og:image" content={new URL(image, page.url).href} />{/if}
</svelte:head>
