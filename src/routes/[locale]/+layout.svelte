<script lang="ts">
  import type { Snippet } from 'svelte'
  import { page } from '$app/state'
  import AccountMenu from '$lib/components/AccountMenu.svelte'
  import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte'
  import { isLocale, localizedHref, t, type Locale } from '$lib/i18n'

  type Data = {
    locale: Locale
    signInEnabled: boolean
    signedIn: boolean
    hasSession: boolean
    profile: { name: string | null; picture: string | null } | null
    isModerator: boolean
  }
  let { data, children }: { data: Data; children: Snippet } = $props()
  const locale = $derived((isLocale(data.locale) ? data.locale : 'en') as Locale)
  const canSwitch = $derived(isLocale(data.locale))
  const path = $derived(page.url.pathname)
  const home = $derived(localizedHref(locale))
  const add = $derived(localizedHref(locale, '/new'))
  const moderate = $derived(localizedHref(locale, '/moderate'))

  // The server sets lang in app.html; this keeps it right after client-side navigation.
  $effect(() => { document.documentElement.lang = locale })
</script>

<header class="site-header">
  <div class="site-header-inner">
    <a class="wordmark" href={home}>{t(locale, 'app.name')}</a>
    <nav class="site-nav" aria-label={t(locale, 'app.name')}>
      <a class="nav-link" href={home} aria-current={path === home || path === `${home}/` ? 'page' : undefined}>{t(locale, 'nav.browse')}</a>
      <a class="nav-link" href={add} aria-current={path === add ? 'page' : undefined}>{t(locale, 'nav.add')}</a>
      {#if data.isModerator}
        <a class="nav-link" href={moderate} aria-current={path === moderate || path.startsWith(`${moderate}/`) ? 'page' : undefined}>{t(locale, 'nav.moderation')}</a>
      {/if}
    </nav>
    <div class="header-actions">
      {#if data.signedIn}
        <AccountMenu name={data.profile?.name ?? null} picture={data.profile?.picture ?? null} {locale} />
      {:else if data.signInEnabled}
        <form method="POST" action={data.hasSession ? '/auth/sign-in' : '/auth/prepare'}><button class="secondary" type="submit">{t(locale, 'auth.signIn')}</button></form>
      {/if}
      {#if canSwitch}<LanguageSwitcher {locale} pathname={path} search={page.url.search} />{/if}
    </div>
  </div>
</header>
<main class="site-main">{@render children()}</main>
<footer class="site-footer"><p><a href="/third-party/README.md">{t(locale, 'footer.thirdParty')}</a></p></footer>
