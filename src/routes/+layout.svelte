<script lang="ts">
  import '../app.css'
  import { page } from '$app/state'
  import { LOCALES, LOCALE_NAMES, LOCALE_COOKIE } from '$lib/i18n'
  import { href, locale, t } from '$lib/t'
  let { data, children } = $props()

  const path = $derived(page.url.pathname.replace(/^\/[^/]+/, ''))
  const section = $derived(path.startsWith('/recent') ? 'recent' : path.startsWith('/about') ? 'about' : path === '' || path === '/' || path.startsWith('/entry/') ? 'browse' : '')
  let menu = $state<HTMLDetailsElement>()
  const remember = (tag: string) => { document.cookie = `${LOCALE_COOKIE}=${tag};path=/;max-age=31536000;samesite=lax`; if (menu) menu.open = false }
  function setTheme(theme: string) {
    document.cookie = `ug.theme=${theme};path=/;max-age=31536000;samesite=lax`
    document.documentElement.dataset.theme = theme
    if (menu) menu.open = false
  }
  const closeMenu = (event: PointerEvent) => { if (menu?.open && !menu.contains(event.target as Node)) menu.open = false }
</script>

<svelte:window onpointerdown={closeMenu} />

<header class="site-header">
  <a class="wordmark" href={href()} aria-label={t('app.name')}>
    <svg viewBox="0 0 32 32" fill="none" width="26" height="26" aria-hidden="true"><path d="M4 4h9v9H4z" fill="currentColor"/><path d="M19 4h9v9h-9z" fill="currentColor"/><path d="M4 19h9v9H4z" fill="currentColor"/><path d="M19 19h9v9h-9z" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2"/></svg>
    <span class="name">{t('app.name')}</span>
    <small class="by" lang="en">GLYPH <b>ATLAS</b></small>
  </a>
  <nav class="site-nav" aria-label={t('nav.menu')}>
    <a class:active={section === 'browse'} aria-current={section === 'browse' ? 'page' : undefined} href={href()}>{t('nav.browse')}</a>
    <a class:active={section === 'recent'} aria-current={section === 'recent' ? 'page' : undefined} href={href('/recent')}>{t('nav.recent')}</a>
    <a class:active={section === 'about'} aria-current={section === 'about' ? 'page' : undefined} href={href('/about')}>{t('nav.about')}</a>
    {#if data.person?.moderator}<a href={href('/moderate')}>{t('moderate.title')}</a>{/if}
  </nav>
  <div class="actions">
    <a class="button primary add" href={href('/new')}>{t('nav.add')}</a>
    <a class="button who" href={href('/me')}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.8 3.4-5.5 7-5.5s6.2 1.700 7 5.500"/></svg>
      <span class="who-name">{data.person?.name ?? (data.signIn ? t('nav.signIn') : t('me.name'))}</span>
    </a>
    <details class="menu" bind:this={menu}>
      <summary class="button" aria-label={t('nav.menu')}>⋯</summary>
      <div class="menu-body">
        <div class="menu-group">
          <span class="menu-label">{t('nav.language')}</span>
          {#each LOCALES as tag}<a href="/{tag}{path}{page.url.search}" class:on={tag === locale()} lang={tag} data-sveltekit-reload onclick={() => remember(tag)}>{LOCALE_NAMES[tag]}</a>{/each}
        </div>
        <div class="menu-group">
          <span class="menu-label">{t('nav.theme')}</span>
          {#each ['system', 'light', 'dark'] as theme}<button type="button" onclick={() => setTheme(theme)}>{t(`theme.${theme}`)}</button>{/each}
        </div>
        <div class="menu-group"><a href="https://ko-fi.com/mkpoli" target="_blank" rel="noopener">{t('nav.sponsor')} ↗</a></div>
      </div>
    </details>
  </div>
</header>

<main>{@render children()}</main>

<footer class="site-footer">
  <p>
    <a class="text-link" href="https://creativecommons.org/licenses/by-sa/4.0/" rel="license noopener" target="_blank">{t('footer.licence')}</a>
    · {t('footer.images')} · {t('footer.code')}
    · <a class="text-link" href="https://glyphatlas.org/" target="_blank" rel="noopener">Glyph Atlas</a>
    · <a class="text-link" href="/api/entries">{t('footer.data')}</a>
    · <a class="text-link" href="https://glyphatlas.org/contact" target="_blank" rel="noopener">{t('footer.contact')}</a>
  </p>
</footer>

<style>
  .site-header { display: flex; align-items: center; gap: 36px; min-height: 76px; padding: 12px var(--page-gutter); border-bottom: 1px solid var(--line); background: var(--paper) }
  .wordmark { display: inline-flex; align-items: center; gap: 10px; min-height: 44px; white-space: nowrap }
  .name { font-size: 17px; font-weight: 600; letter-spacing: .02em }
  .by { padding-left: 10px; border-left: 1px solid var(--line); color: var(--muted); font-size: 10.5px; letter-spacing: .12em; font-weight: 400 }
  .by b { font-weight: 600 }
  .site-nav { display: flex; align-items: stretch; align-self: stretch; gap: 26px; margin: -12px 0 }
  .site-nav a { display: flex; align-items: center; color: var(--muted); border-bottom: 2px solid transparent; white-space: nowrap }
  .site-nav a:hover { color: var(--ink) }
  .site-nav a.active { color: var(--ink); border-bottom-color: var(--ink) }
  .actions { display: flex; align-items: center; gap: 8px; margin-left: auto }
  .who-name { max-width: 16ch; overflow: hidden; text-overflow: ellipsis }
  .menu { position: relative }
  .menu summary { list-style: none; width: 40px; padding: 0; font-size: 18px; letter-spacing: 1px }
  .menu summary::-webkit-details-marker { display: none }
  .menu-body { position: absolute; z-index: 20; top: calc(100% + 6px); right: 0; width: 210px; padding: 8px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface); box-shadow: 0 8px 28px rgb(0 0 0 / 14%) }
  .menu-group { display: flex; flex-direction: column; padding: 4px 0 }
  .menu-group + .menu-group { margin-top: 4px; border-top: 1px solid var(--line); padding-top: 8px }
  .menu-label { padding: 2px 10px 4px; font-size: 11px; color: var(--muted) }
  .menu-group a, .menu-group button { display: block; width: 100%; min-height: 36px; padding: 7px 10px; border: 0; border-radius: 6px; background: none; text-align: left; cursor: pointer }
  .menu-group a:hover, .menu-group button:hover { background: var(--surface-sunken) }
  .menu-group a.on { color: var(--accent); font-weight: 500 }
  main { min-height: 60vh }
  .site-footer { padding: 18px var(--page-gutter) 36px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px }
  @media (max-width: 960px) {
    .site-header { flex-wrap: wrap; gap: 8px 16px }
    .site-nav { order: 3; flex: 1 1 100%; margin: 0; min-height: 40px; gap: 20px; overflow-x: auto }
    .by { display: none }
  }
  @media (max-width: 520px) {
    .who-name { max-width: 9ch }
    .add { padding-inline: 10px }
  }
</style>
