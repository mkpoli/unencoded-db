<script lang="ts">
  import type { Snippet } from 'svelte'
  import { page } from '$app/state'
  import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte'
  import { isLocale, localizedHref, t, type Locale } from '$lib/i18n'

  type Data = {
    locale: Locale
    signInEnabled: boolean
    signedIn: boolean
    hasSession: boolean
  }
  let { data, children }: { data: Data; children: Snippet } = $props()
  const locale = $derived((isLocale(data.locale) ? data.locale : 'en') as Locale)
  const canSwitch = $derived(isLocale(data.locale))

  // The server sets lang in app.html; this keeps it right after client-side navigation.
  $effect(() => { document.documentElement.lang = locale })
</script>

<header>
  <nav>
    <a class="brand" href={localizedHref(locale)}>{t(locale, 'app.name')}</a>
    <div class="nav-actions">
      <a href={localizedHref(locale, '/new')}>{t(locale, 'nav.add')}</a>
      {#if data.signedIn}
        <span class="account">Glyph Atlas</span>
        <form method="POST" action="/auth/sign-out"><button class="nav-button">{t(locale, 'auth.signOut')}</button></form>
      {:else if data.signInEnabled && data.hasSession}
        <form method="POST" action="/auth/sign-in"><button class="nav-button">{t(locale, 'auth.link')}</button></form>
      {:else if data.signInEnabled}
        <form method="POST" action="/auth/prepare"><button class="nav-button">{t(locale, 'auth.signIn')}</button></form>
      {/if}
      {#if canSwitch}<LanguageSwitcher {locale} pathname={page.url.pathname} search={page.url.search} />{/if}
    </div>
  </nav>
</header>
<main>{@render children()}</main>
<footer><a href="/third-party/README.md">{t(locale, 'footer.thirdParty')}</a></footer>

<style>
  .nav-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: end; gap: 1rem; }
  .nav-actions form { display: block; }
  .account { color: var(--muted); font-size: 13px; }
  @media (max-width: 720px) {
    nav { flex-wrap: wrap; row-gap: 8px; }
    .nav-actions { width: 100%; justify-content: space-between; }
  }
</style>
