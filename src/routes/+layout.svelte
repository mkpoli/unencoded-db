<script lang="ts">
  import '../style.css'
  import { page } from '$app/state'
  import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte'
  import { isLocale, localizedHref, t, type Locale } from '$lib/i18n'

  let { children } = $props()
  const locale = $derived((isLocale(page.params.locale) ? page.params.locale : 'en') as Locale)
  const canSwitch = $derived(isLocale(page.params.locale))
  const path = $derived(page.url.pathname)
  const home = $derived(localizedHref(locale))
  const add = $derived(localizedHref(locale, '/new'))

  // The server sets lang in app.html; this keeps it right after client-side navigation.
  $effect(() => { document.documentElement.lang = locale })
</script>

<header class="site-header">
  <div class="site-header-inner">
    <a class="wordmark" href={home}>{t(locale, 'app.name')}</a>
    <nav class="site-nav" aria-label={t(locale, 'app.name')}>
      <a class="nav-link" href={home} aria-current={path === home || path === `${home}/` ? 'page' : undefined}>{t(locale, 'nav.browse')}</a>
      <a class="nav-link" href={add} aria-current={path === add ? 'page' : undefined}>{t(locale, 'nav.add')}</a>
    </nav>
    <div class="header-actions">
      {#if canSwitch}<LanguageSwitcher {locale} pathname={path} search={page.url.search} />{/if}
    </div>
  </div>
</header>
<main class="site-main">{@render children()}</main>
<footer class="site-footer"><p><a href="/third-party/README.md">{t(locale, 'footer.thirdParty')}</a></p></footer>
