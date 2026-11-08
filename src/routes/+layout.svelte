<script lang="ts">
  import '../style.css'
  import { page } from '$app/state'
  import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte'
  import { isLocale, localizedHref, t, type Locale } from '$lib/i18n'

  let { children } = $props()
  const locale = $derived((isLocale(page.params.locale) ? page.params.locale : 'en') as Locale)
  const canSwitch = $derived(isLocale(page.params.locale))

  // The server sets lang in app.html; this keeps it right after client-side navigation.
  $effect(() => { document.documentElement.lang = locale })
</script>

<header>
  <nav>
    <a class="brand" href={localizedHref(locale)}>{t(locale, 'app.name')}</a>
    <div class="nav-actions">
      <a href={localizedHref(locale, '/new')}>{t(locale, 'nav.add')}</a>
      {#if canSwitch}<LanguageSwitcher {locale} pathname={page.url.pathname} search={page.url.search} />{/if}
    </div>
  </nav>
</header>
<main>{@render children()}</main>
<footer><a href="/third-party/README.md">{t(locale, 'footer.thirdParty')}</a></footer>

<style>
  .nav-actions { display: flex; align-items: center; gap: 18px; }
  @media (max-width: 720px) {
    nav { flex-wrap: wrap; row-gap: 8px; }
    .nav-actions { width: 100%; justify-content: space-between; }
  }
</style>
