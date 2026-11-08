<script lang="ts">
  import { LOCALES, LOCALE_NAMES, switchLocaleHref, t, type Locale } from '$lib/i18n'
  let { locale, pathname, search = '' }: { locale: Locale; pathname: string; search?: string } = $props()
  let options: HTMLDetailsElement

  function closeOnEscape(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !options?.open) return
    options.open = false
    options.querySelector('summary')?.focus()
  }
</script>

<svelte:window onkeydown={closeOnEscape} />

<details class="language-menu" bind:this={options}>
  <summary aria-label={`${t(locale, 'nav.language')}: ${LOCALE_NAMES[locale]}`}>{LOCALE_NAMES[locale]}</summary>
  <div class="language-list">
    {#each LOCALES as tag (tag)}
      <a href={switchLocaleHref(tag, pathname, search)} lang={tag} hreflang={tag} class:active={tag === locale} aria-current={tag === locale ? 'page' : undefined} onclick={() => { if (options) options.open = false }}>
        {LOCALE_NAMES[tag]}
      </a>
    {/each}
  </div>
</details>
