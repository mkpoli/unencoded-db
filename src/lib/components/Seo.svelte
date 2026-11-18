<script lang="ts">
  import { page } from '$app/state'
  import { isLocale, LOCALES, translate, type Locale } from '$lib/i18n'
  import { isIndexable, SITE_ORIGIN, snippet } from '$lib/seo'
  import { getSocialPage, socialPageFor, socialPageTitle } from '$lib/social-pages'
  import { t } from '$lib/t'

  const SOCIAL_LOCALES: Record<Locale, string> = { en: 'en_US', ja: 'ja_JP', 'zh-Hant': 'zh_TW', 'zh-Hans': 'zh_CN', ko: 'ko_KR', vi: 'vi_VN' }
  const SITE_SCHEMA = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'WebSite', url: `${SITE_ORIGIN}/`,
    name: translate('en', 'app.name'), alternateName: translate('zh-Hant', 'app.name'),
  }).replace(/</g, '\\u003c')

  let { title, description, image, imageAlt }: { title?: string; description?: string; image?: string | null; imageAlt?: string } = $props()
  const language = $derived(isLocale(page.params.locale) ? page.params.locale : 'en')
  const path = $derived(page.url.pathname.replace(/^\/[^/]+/, ''))
  const index = $derived(page.status < 400 && isIndexable(path, page.url.searchParams))
  const canonical = $derived(`${SITE_ORIGIN}/${language}${path}`)
  const full = $derived(title ? `${title} · ${t('app.name')}` : `${t('app.name')} · ${t('app.tagline')}`)
  const section = $derived(socialPageFor(page.route.id, page.status))
  const sectionCard = $derived(getSocialPage(section)!)
  const detailImage = $derived(page.status < 400 ? image : null)
  const publicCopy = $derived(Boolean(detailImage || sectionCard.publicTitle) && page.status < 400)
  const approved = $derived(socialPageTitle(language, sectionCard.title))
  const socialTitle = $derived(publicCopy ? full : `${approved} · ${t('app.name')}`)
  const text = $derived(snippet((publicCopy ? description : null) || t('app.description')))
  const approvedPath = $derived(sectionCard.path.includes('[') ? '' : sectionCard.path)
  const socialUrl = $derived(page.status >= 400 ? `${SITE_ORIGIN}/${language}`
    : publicCopy ? canonical : `${SITE_ORIGIN}/${language}${approvedPath}`)
  const imageUrl = $derived(new URL(detailImage || `/${language}/card/${section}.png`, SITE_ORIGIN).href)
  const alt = $derived(detailImage ? snippet(imageAlt || title || t('field.image'), 420) : approved)
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
    <meta property="og:type" content="website" />
    <meta property="og:url" content={socialUrl} />
    <meta property="og:title" content={socialTitle} />
    <meta property="og:site_name" content={t('app.name')} />
    <meta property="og:description" content={text} />
    <meta property="og:locale" content={SOCIAL_LOCALES[language]} />
    {#each LOCALES.filter(tag => tag !== language) as alternate}
      <meta property="og:locale:alternate" content={SOCIAL_LOCALES[alternate]} />
    {/each}
    <meta property="og:image" content={imageUrl} />
    <meta property="og:image:alt" content={alt} />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={socialTitle} />
    <meta name="twitter:description" content={text} />
    <meta name="twitter:image" content={imageUrl} />
    <meta name="twitter:image:alt" content={alt} />
</svelte:head>
