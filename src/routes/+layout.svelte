<script lang="ts">
  import '../app.css'
  import { afterNavigate } from '$app/navigation'
  import { page } from '$app/state'
  import { onMount, tick } from 'svelte'
  import { LOCALES, LOCALE_NAMES, LOCALE_COOKIE } from '$lib/i18n'
  import { href, locale, t } from '$lib/t'
  import { clearDirectBrowseBack, hydrateBrowseReturn, trackBrowseNavigation } from '$lib/browse-return.svelte'
  import { syncFavourites } from '$lib/favourites.svelte'
  import { UNREAD_SHOWN } from '$lib/notifications'
  import ChatLinks from '$lib/components/ChatLinks.svelte'
  let { data, children } = $props()

  const path = $derived(page.url.pathname.replace(/^\/[^/]+/, ''))
  const section = $derived(path.startsWith('/favourites') ? 'favourites' : path.startsWith('/data') ? 'data' : path === '/u' || path.startsWith('/u/') ? 'people' : path.startsWith('/duplicates') ? 'duplicates' : path.startsWith('/imports') ? 'imports' : path.startsWith('/mcp') ? 'mcp' : path.startsWith('/history') ? 'history' : path.startsWith('/source') ? 'sources' : path.startsWith('/radicals') ? 'radicals' : path.startsWith('/tags') ? 'tags' : path.startsWith('/chronology') ? 'chronology' : path.startsWith('/fonts') ? 'fonts' : path.startsWith('/about') ? 'about' : path === '' || path === '/' || path.startsWith('/entry/') ? 'browse' : '')
  $effect(() => { syncFavourites(data.person?.id ?? null, data.favourites) })
  type NavMode = 'full' | 'priority' | 'compact'
  let navMode = $state<NavMode>()
  let navigation = $state<HTMLElement>()
  let navLinks = $state<HTMLDivElement>()
  let navToggle = $state<HTMLButtonElement>()
  let menu = $state<HTMLDetailsElement>()
  let moreToggle = $state<HTMLElement>()
  // The notices open on their own page count as read there.
  const unread = $derived(path.startsWith('/notifications') ? 0 : data.unread)
  const unreadText = $derived(unread > UNREAD_SHOWN ? `${UNREAD_SHOWN}+` : String(unread))
  const showSignIn = $derived(!data.person && data.signIn)
  const account = $derived(data.person?.name ?? (showSignIn ? t('nav.signIn') : t('me.name')))

  // Measure the actual translated labels at their inline size, including moderator navigation.
  // The nav owns the space left between the wordmark and the actions.
  $effect(() => {
    const nav = navigation
    if (!nav || !('showPopover' in HTMLElement.prototype)) return
    void locale()
    void data.person?.moderator
    let live = true
    function fit() {
      if (!live || !nav) return
      const focus = document.activeElement
      const focusedLink = focus instanceof HTMLAnchorElement && nav.contains(focus) ? focus.getAttribute('href') : null
      nav.setAttribute('data-measuring', '')
      const links = [...nav.querySelectorAll<HTMLAnchorElement>('a')]
      const available = nav.getBoundingClientRect().width
      const gap = parseFloat(getComputedStyle(nav).columnGap)
      const widths = links.map(link => link.getBoundingClientRect().width)
      const all = widths.reduce((sum, width) => sum + width, 0) + gap * (widths.length - 1)
      const priority = widths.slice(0, 2).reduce((sum, width) => sum + width, 0) + 2 * gap + (navToggle?.offsetWidth ?? 0)
      nav.removeAttribute('data-measuring')
      const next: NavMode = all <= available ? 'full' : priority <= available ? 'priority' : 'compact'
      if (nav.dataset.mode === next) {
        if (navLinks?.matches(':popover-open')) positionNavigation()
        return
      }
      if (navLinks?.matches(':popover-open')) navLinks.hidePopover()
      navMode = next
      if (focusedLink || focus === navToggle) void tick().then(() => {
        if (!live) return
        const target = [...nav.querySelectorAll<HTMLAnchorElement>('a')].find(link => link.getAttribute('href') === focusedLink)
        if (target?.getClientRects().length) target.focus()
        else if (next === 'full') nav.querySelector('a')?.focus()
        else navToggle?.focus()
      })
    }
    const observer = new ResizeObserver(fit)
    observer.observe(nav)
    document.fonts.addEventListener('loadingdone', fit)
    void document.fonts.ready.then(fit)
    return () => { live = false; observer.disconnect(); document.fonts.removeEventListener('loadingdone', fit) }
  })

  onMount(() => {
    hydrateBrowseReturn()
  })

  afterNavigate(navigation => {
    trackBrowseNavigation(navigation)
    if (navLinks?.hasAttribute('popover')) navLinks.hidePopover?.()
    if (menu) menu.open = false
  })

  function positionNavigation() {
    if (!navToggle || !navLinks) return
    const { left, bottom } = navToggle.getBoundingClientRect()
    navLinks.style.setProperty('--nav-left', `${left}px`)
    navLinks.style.setProperty('--nav-top', `${bottom}px`)
    navLinks.style.setProperty('--nav-scroll', `${window.scrollY}px`)
  }

  function dismissSettings(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !menu?.open || !menu.contains(document.activeElement)) return
    menu.open = false
    moreToggle?.focus()
  }
  const remember = (tag: string) => { document.cookie = `${LOCALE_COOKIE}=${tag};path=/;max-age=31536000;samesite=lax`; if (menu) menu.open = false }
  function setTheme(theme: string) {
    document.cookie = `ug.theme=${theme};path=/;max-age=31536000;samesite=lax`
    document.documentElement.dataset.theme = theme
    if (menu) menu.open = false
  }
  const closeMenu = (event: PointerEvent) => { if (menu?.open && !menu.contains(event.target as Node)) menu.open = false }
</script>

<svelte:window onpointerdown={closeMenu} onkeydown={dismissSettings} onhashchange={clearDirectBrowseBack} />

{#snippet primaryLinks()}
  <a class:active={section === 'browse'} aria-current={section === 'browse' ? 'page' : undefined} href={href()}>{t('nav.browse')}</a>
  <a class:active={section === 'fonts'} aria-current={section === 'fonts' ? 'page' : undefined} href={href('/fonts')}>{t('nav.fonts')}</a>
{/snippet}

<header class="site-header">
  <a class="wordmark" href={href()} aria-label={t('app.name')}>
    <svg viewBox="0 0 32 32" fill="none" width="26" height="26" aria-hidden="true"><path d="M4 4h9v9H4z" fill="currentColor"/><path d="M19 4h9v9h-9z" fill="currentColor"/><path d="M4 19h9v9H4z" fill="currentColor"/><path d="M19 19h9v9h-9z" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2"/></svg>
    <span class="name">{t('app.name')}</span>
    <small class="by" lang="en">GLYPH <b>ATLAS</b></small>
  </a>
  <nav class="site-nav" bind:this={navigation} data-mode={navMode}>
    {#if navMode === 'priority'}{@render primaryLinks()}{/if}
    <button class="button nav-toggle" bind:this={navToggle} type="button" aria-label={t('nav.navigation')} aria-controls="site-links" popovertarget="site-links">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
    </button>
    <div class="site-links" id="site-links" bind:this={navLinks} popover={navMode === 'full' ? undefined : 'auto'} onbeforetoggle={event => { if (event.newState === 'open') positionNavigation() }}>
      {#if navMode !== 'priority'}{@render primaryLinks()}{/if}
      <a class:active={section === 'radicals'} aria-current={section === 'radicals' ? 'page' : undefined} href={href('/radicals')}>{t('nav.radicals')}</a>
      <a class:active={section === 'tags'} aria-current={section === 'tags' ? 'page' : undefined} href={href('/tags')}>{t('nav.tags')}</a>
      <a class:active={section === 'chronology'} aria-current={section === 'chronology' ? 'page' : undefined} href={href('/chronology')}>{t('nav.chronology')}</a>
      <a class:active={section === 'sources'} aria-current={section === 'sources' ? 'page' : undefined} href={href('/sources')}>{t('nav.sources')}</a>
      <a class:active={section === 'history'} aria-current={section === 'history' ? 'page' : undefined} href={href('/history')}>{t('nav.history')}</a>
      <a class:active={section === 'about'} aria-current={section === 'about' ? 'page' : undefined} href={href('/about')}>{t('nav.about')}</a>
      {#if data.person?.moderator}<a href={href('/moderate')}>{t('moderate.title')}</a>{/if}
    </div>
  </nav>
  <div class="actions">
    <a class="button primary add" href={href('/new')}>{t('nav.add')}</a>
    {#if data.person}
      <!-- Bell: Lucide (ISC license), https://lucide.dev/icons/bell -->
      <a class="button bell" class:on={path.startsWith('/notifications')} href={href('/notifications')} aria-label={unread ? `${t('notifications.title')} ${unreadText}` : t('notifications.title')} title={t('notifications.title')} data-sveltekit-preload-data="off">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/></svg>
        {#if unread}<span class="unread" aria-hidden="true">{unreadText}</span>{/if}
      </a>
    {/if}
    <a class="button who" class:sign-in={showSignIn} href={href('/me')} aria-label={account}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.8 3.4-5.5 7-5.5s6.2 1.700 7 5.500"/></svg>
      <span class="who-name">{account}</span>
    </a>
    <details class="menu" bind:this={menu}>
      <summary class="button" bind:this={moreToggle} aria-label={t('nav.menu')}>⋯</summary>
      <div class="menu-body">
        <div class="menu-group">
          <a href={href('/favourites')} class:on={section === 'favourites'} onclick={() => { if (menu) menu.open = false }}>{t('favourites.title')}</a>
          <a href={href('/u')} class:on={section === 'people'} aria-current={path === '/u' ? 'page' : undefined} onclick={() => { if (menu) menu.open = false }}>{t('people.title')}</a>
          <a href={href('/duplicates')} class:on={section === 'duplicates'} aria-current={section === 'duplicates' ? 'page' : undefined} onclick={() => { if (menu) menu.open = false }}>{t('duplicates.title')}</a>
          <a href={href('/imports')} class:on={section === 'imports'} aria-current={section === 'imports' ? 'page' : undefined} onclick={() => { if (menu) menu.open = false }}>{t('imports.title')}</a>
          <a href={href('/data')} class:on={section === 'data'} aria-current={section === 'data' ? 'page' : undefined} onclick={() => { if (menu) menu.open = false }}>{t('data.title')}</a>
          <a href={href('/mcp')} class:on={section === 'mcp'} aria-current={section === 'mcp' ? 'page' : undefined} onclick={() => { if (menu) menu.open = false }}>{t('mcp.title')}</a>
        </div>
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
    · <a class="text-link" href={href('/data')}>{t('footer.data')}</a>
    · <a class="text-link" href={href('/mcp')}>{t('footer.mcp')}</a>
  </p>
  <p><ChatLinks /></p>
</footer>

<style>
  .site-header { display: flex; flex-wrap: wrap; align-items: center; gap: 8px clamp(12px, 2vw, 36px); min-block-size: 76px; padding: 12px var(--page-gutter); border-bottom: 1px solid var(--line); background: var(--paper) }
  .wordmark { display: inline-flex; align-items: center; gap: 10px; min-block-size: 44px; min-inline-size: 0 }
  .wordmark svg, .who svg { flex: none }
  .name { font-size: 1.0625rem; font-weight: 600; letter-spacing: .02em }
  .by { padding-inline-start: 10px; border-inline-start: 1px solid var(--line); color: var(--muted); font-size: 10.5px; letter-spacing: .12em; font-weight: 400; white-space: nowrap }
  .by b { font-weight: 600 }
  .site-nav { display: flex; flex: 1 1 0; min-inline-size: max(40px, var(--target-size)); align-self: stretch; align-items: center; column-gap: clamp(12px, 1.5vw, 26px); margin-block: -12px }
  .site-nav > a { align-self: stretch }
  .site-nav[data-mode="full"] .site-links { align-self: stretch; align-items: stretch }
  .site-links { position: static; display: flex; flex-wrap: wrap; align-items: center; gap: 2px clamp(12px, 1.5vw, 26px); inline-size: auto; margin: 0; padding: 0; border: 0; background: none; color: inherit }
  .site-nav a { white-space: nowrap; display: flex; align-items: center; min-block-size: var(--target-size); padding-block: 8px; border-bottom: 2px solid transparent; color: var(--muted) }
  .site-nav a:hover { color: var(--ink) }
  .site-nav a.active { color: var(--ink); border-bottom-color: var(--ink) }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-inline-size: 0; margin-inline-start: auto }
  .bell { position: relative; flex: none; padding-inline: 10px }
  .bell.on { border-color: var(--line-strong) }
  .unread { position: absolute; inset-block-start: -6px; inset-inline-end: -6px; min-inline-size: 18px; padding: 0 5px; border-radius: 999px; background: var(--accent); color: var(--on-accent, #fff); font-size: 11px; font-weight: 600; line-height: 18px; text-align: center; font-variant-numeric: tabular-nums }
  .who-name { max-inline-size: 16ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
  .menu { position: relative; flex: none }
  .nav-toggle, .menu summary { inline-size: max(40px, var(--target-size)); padding: 0 }
  .nav-toggle { display: none }
  .menu summary { list-style: none; font-size: 18px; letter-spacing: 1px }
  .menu summary::-webkit-details-marker { display: none }
  .menu-body { position: absolute; z-index: 20; inset-block-start: calc(100% + 6px); inset-inline-end: 0; inline-size: 14rem; inline-size: min(14rem, calc(100dvi - 2 * var(--page-gutter))); max-block-size: calc(100vh - 8rem); max-block-size: calc(100dvb - 8rem); overflow: auto; overscroll-behavior: contain; padding: 8px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface); box-shadow: 0 8px 28px rgb(0 0 0 / 14%) }
  .menu-group { display: flex; flex-direction: column; padding: 4px 0 }
  .menu-group + .menu-group { margin-top: 4px; border-top: 1px solid var(--line); padding-top: 8px }
  .menu-label { padding: 2px 10px 4px; font-size: 11px; color: var(--muted) }
  .menu-group a, .menu-group button { display: block; width: 100%; min-block-size: max(36px, var(--target-size)); padding: 7px 10px; border: 0; border-radius: 6px; background: none; text-align: left; cursor: pointer }
  .menu-group a:hover, .menu-group button:hover { background: var(--surface-sunken) }
  .menu-group a.on { color: var(--accent); font-weight: 500 }
  main { min-block-size: 60dvb }
  .site-footer { padding: 18px var(--page-gutter) 36px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px }
  @media (max-width: 80rem) {
    .by { display: none }
  }
  @media (max-width: 70rem) {
    .who, .add { padding-inline: 10px }
  }
  @supports selector(:popover-open) {
    .site-nav:not([data-mode="full"]) .nav-toggle { display: inline-flex }
    .site-links[popover] {
      --nav-size: min(18rem, calc(100% - 2 * var(--page-gutter)));
      --nav-offset: min(calc(var(--nav-top, 4rem) + 6px), 50dvb);
      position: absolute;
      display: none;
      inset: auto;
      inset-block-start: calc(var(--nav-offset) + var(--nav-scroll, 0px));
      inset-inline-start: clamp(var(--page-gutter), var(--nav-left, var(--page-gutter)), calc(100% - var(--page-gutter) - var(--nav-size)));
      inline-size: var(--nav-size);
      max-inline-size: none;
      max-block-size: min(calc(100dvb - var(--nav-offset) - 8px), 24rem);
      margin: 0;
      padding: 6px;
      overflow: auto;
      overscroll-behavior: contain;
      border: 1px solid var(--line);
      border-radius: 9px;
      background: var(--surface);
      box-shadow: 0 8px 28px rgb(0 0 0 / 14%);
    }
    .site-links[popover]:popover-open { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)) }
    .site-links[popover] a { white-space: normal; overflow-wrap: anywhere; padding: 8px 10px; border: 0; border-radius: 5px }
    .site-links[popover] a:hover, .site-links[popover] a.active { background: var(--surface-selected) }
  }
  @media (min-width: 94rem) {
    .site-nav:not([data-mode]) .nav-toggle { display: none }
    .site-nav:not([data-mode]) .site-links { display: flex; position: static; inline-size: auto; max-block-size: none; overflow: visible; padding: 0; border: 0; box-shadow: none; align-self: stretch; align-items: stretch }
    .site-nav:not([data-mode]) .site-links a { padding-inline: 0 }
  }
  @media (max-width: 42rem) {
    .wordmark { flex-basis: 100% }
    .who { min-inline-size: max(40px, var(--target-size)) }
    .who, .add { padding-inline: 8px }
    .who:not(.sign-in) .who-name, .sign-in svg { display: none }
    .site-links { --nav-top: 7rem }
  }
  @supports not selector(:popover-open) {
    .site-nav { order: 3; flex: 1 1 100%; margin-block: 0 }
  }
  /* Keep measurements independent of the open panel's grid, padding and wrapping. */
  .site-nav:global([data-measuring]) .site-links { display: flex; position: absolute; visibility: hidden; inline-size: max-content; max-inline-size: none; flex-wrap: nowrap; padding: 0; border: 0 }
  .site-nav:global([data-measuring]) a { padding-inline: 0; white-space: nowrap; inline-size: max-content; flex: none }
  .site-nav:global([data-measuring]) .nav-toggle { display: inline-flex; flex: none }
</style>
