<script lang="ts">
  import { page } from '$app/state'
  import { isLocale, LOCALES, translate } from '$lib/i18n'
  import { isIndexable, SITE_ORIGIN, snippet } from '$lib/seo'
  import { t } from '$lib/t'

  const SITE_SCHEMA = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'WebSite', url: `${SITE_ORIGIN}/`,
    name: translate('en', 'app.name'), alternateName: translate('zh-Hant', 'app.name'),
  }).replace(/</g, '\\u003c')

  let { title, description, image }: { title?: string; description?: string; image?: string | null } = $props()
  const language = $derived(isLocale(page.params.locale) ? page.params.locale : 'en')
  const path = $derived(page.url.pathname.replace(/^\/[^/]+/, ''))
  const index = $derived(isIndexable(path, page.url.searchParams))
  const canonical = $derived(`${SITE_ORIGIN}/${language}${path}`)
  const full = $derived(title ? `${title} · ${t('app.name')}` : `${t('app.name')} · ${t('app.tagline')}`)
  const text = $derived(snippet(description || t('app.description')))
</script>

<svelte:head>
  <title>{full}</title>
  <meta name="robots" content={index ? 'max-image-preview:large' : 'noindex'} />
  {#if index}
    <link rel="canonical" href={canonical} />
    {#each LOCALES as alternate}
      <link rel="alternate" hreflang={alternate} href={`${SITE_ORIGIN}/${alternate}${path}`} />
    {/each}
    <link rel="alternate" hreflang="x-default" href={`${SITE_ORIGIN}${path ? `/en${path}` : '/'}`} />
    {#if !path}
      {@html `<script type="application/ld+json">${SITE_SCHEMA}</script>`}
    {/if}
  {/if}
  <meta name="description" content={text} />
  <meta property="og:title" content={full} />
  <meta property="og:site_name" content={t('app.name')} />
  <meta property="og:description" content={text} />
  <meta property="og:type" content="website" />
  {#if image}<meta property="og:image" content={new URL(image, SITE_ORIGIN).href} />{/if}
</svelte:head>
