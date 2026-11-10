<script lang="ts">
  import { t, type Locale } from '$lib/i18n'

  let { name, picture, locale }: { name: string | null; picture: string | null; locale: Locale } = $props()
  let menu = $state<HTMLDetailsElement>()
  const initial = $derived(Array.from(name?.trim() || 'G')[0]?.toUpperCase() ?? 'G')
  const profileHref = $derived(`https://glyphatlas.org/${locale}/account`)

  function close() { if (menu) menu.open = false }

  function closeOnEscape(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !menu?.open) return
    event.preventDefault()
    menu.open = false
    menu.querySelector('summary')?.focus()
  }

  function closeOnPointer(event: PointerEvent) {
    if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) menu.open = false
  }
</script>

<svelte:window onkeydown={closeOnEscape} onpointerdown={closeOnPointer} />

<details class="account-menu" bind:this={menu}>
  <summary>
    <span class="avatar">
      {#if picture}<img src={picture} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}{initial}{/if}
    </span>
    <span class="account-name">{name ?? 'Glyph Atlas'}</span>
  </summary>
  <div class="account-panel">
    <div class="account-identity">
      <span class="avatar large">
        {#if picture}<img src={picture} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}{initial}{/if}
      </span>
      <span class="account-identity-name">{name ?? 'Glyph Atlas'}</span>
    </div>
    <a class="account-profile" href={profileHref} target="_blank" rel="noopener noreferrer" onclick={close}>{t(locale, 'account.profile')}</a>
    <form method="POST" action="/auth/sign-out">
      <button class="account-signout" type="submit">{t(locale, 'auth.signOut')}</button>
    </form>
  </div>
</details>
