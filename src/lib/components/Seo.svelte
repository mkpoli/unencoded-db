<script lang="ts">
  import { page } from '$app/state'
  import { isLocale, LOCALES, translate, type Locale } from '$lib/i18n'
  import { isIndexable, isPublicPage, SITE_ORIGIN, snippet } from '$lib/seo'
  import { t } from '$lib/t'

  const SOCIAL_LOCALES: Record<Locale, string> = { en: 'en_US', ja: 'ja_JP', 'zh-Hant': 'zh_TW', 'zh-Hans': 'zh_CN', ko: 'ko_KR', vi: 'vi_VN' }
  const SITE_IMAGE = { path: '/social-card.png', alt: '珍字集覽 · Rare Character Compendium · Glyph Atlas', width: '1200', height: '630' }
  const SITE_SCHEMA = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'WebSite', url: `${SITE_ORIGIN}/`,
    name: translate('en', 'app.name'), alternateName: translate('zh-Hant', 'app.name'),
  }).replace(/</g, '\\u003c')

  let { title, description, image, imageAlt }: { title?: string; description?: string; image?: string | null; imageAlt?: string } = $props()
  const language = $derived(isLocale(page.params.locale) ? page.params.locale : 'en')
  const path = $derived(page.url.pathname.replace(/^\/[^/]+/, ''))
  const publicPage = $derived(isPublicPage(path))
  const index = $derived(isIndexable(path, page.url.searchParams))
  const canonical = $derived(`${SITE_ORIGIN}/${language}${path}`)
  const full = $derived(title ? `${title} · ${t('app.name')}` : `${t('app.name')} · ${t('app.tagline')}`)
  const text = $derived(snippet(description || t('app.description')))
  const imageUrl = $derived(new URL(image || SITE_IMAGE.path, SITE_ORIGIN).href)
  const alt = $derived(image ? snippet(imageAlt || title || t('field.image'), 420) : SITE_IMAGE.alt)
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
  {#if publicPage}
    <meta name="description" content={text} />
    <meta property="og:type" content="website" />
    <meta property="og:url" content={canonical} />
    <meta property="og:title" content={full} />
    <meta property="og:site_name" content={t('app.name')} />
    <meta property="og:description" content={text} />
    <meta property="og:locale" content={SOCIAL_LOCALES[language]} />
    {#each LOCALES.filter(tag => tag !== language) as alternate}
      <meta property="og:locale:alternate" content={SOCIAL_LOCALES[alternate]} />
    {/each}
    <meta property="og:image" content={imageUrl} />
    <meta property="og:image:alt" content={alt} />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content={SITE_IMAGE.width} />
    <meta property="og:image:height" content={SITE_IMAGE.height} />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={full} />
    <meta name="twitter:description" content={text} />
    <meta name="twitter:image" content={imageUrl} />
    <meta name="twitter:image:alt" content={alt} />
  {/if}
</svelte:head>
