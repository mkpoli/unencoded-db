<script lang="ts">
  import { LOCALES, LOCALE_NAMES, switchLocaleHref, t, type Locale } from '$lib/i18n'
  let { locale, pathname, search = '' }: { locale: Locale; pathname: string; search?: string } = $props()
  let options: HTMLDetailsElement
</script>

<details class="switcher" bind:this={options}>
  <summary aria-label={`${t(locale, 'nav.language')}: ${LOCALE_NAMES[locale]}`}>{LOCALE_NAMES[locale]}</summary>
  <div class="languages">
    {#each LOCALES as tag (tag)}
      <a href={switchLocaleHref(tag, pathname, search)} lang={tag} hreflang={tag} class:active={tag === locale} aria-current={tag === locale ? 'page' : undefined} onclick={() => { if (options) options.open = false }}>
        {LOCALE_NAMES[tag]}
      </a>
    {/each}
  </div>
</details>

<style>
  .switcher { position: relative; border: 0; }
  summary { display: flex; align-items: center; gap: 6px; min-height: 36px; padding: 6px 10px; border: 1px solid var(--line); border-radius: 7px; font-size: 13px; font-weight: 400; list-style: none; cursor: pointer; }
  summary::-webkit-details-marker { display: none; }
  summary::after { content: '▾'; color: var(--muted); font-size: 10px; }
  .switcher[open] summary { border-color: var(--line-strong); }
  .languages { position: absolute; z-index: 20; top: calc(100% + 6px); right: 0; width: 150px; padding: 6px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); box-shadow: 0 8px 24px rgb(0 0 0 / 14%); }
  .languages a { display: block; padding: 7px 9px; border-radius: 5px; color: var(--ink); text-decoration: none; line-height: 1.3; }
  .languages a:hover { background: var(--sunken); }
  .languages a.active { color: var(--accent); font-weight: 600; }
</style>
