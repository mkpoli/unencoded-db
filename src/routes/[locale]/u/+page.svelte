<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import { href, locale, t } from '$lib/t'
  let { data } = $props()
  const number = $derived(new Intl.NumberFormat(locale()))
  const initial = (name: string) => /^anon-[0-9a-f]{6}$/.test(name) ? null : [...name.replace(/^[^\p{L}\p{N}]+/u, '') || name][0].toUpperCase()
</script>

<Seo title={t('people.title')} />
<div class="page narrow stack">
  <h1>{t('people.title')}</h1>
  {#if data.people.length}
    <ol class="people" start={data.first}>
      {#each data.people as person, i (person.id)}
        {@const letter = initial(person.name)}
        <li class:mine={person.id === data.person?.id} class:podium={data.first + i <= 3}>
          <span class="place">{number.format(data.first + i)}</span>
          <span class="avatar" class:unnamed={!letter} aria-hidden="true">{letter ?? '?'}</span>
          <a class="name" href={href(`/u/${person.id}`)}>{person.name}</a>
          <span class="total">{t(person.changes === 1 ? 'people.change' : 'people.changes', { n: number.format(person.changes) })}</span>
        </li>
      {/each}
    </ol>
  {:else}
    <p class="muted">{t('person.empty')}</p>
  {/if}
  {#if data.next}<a class="button more" href="?page={data.next}">{t('browse.more')}</a>{/if}
</div>

<style>
  .people { margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--line) }
  .people li { position: relative; display: flex; align-items: center; gap: 14px; padding: 12px 8px; border-bottom: 1px solid var(--line); font-size: 13px }
  .people li:hover { background: var(--surface-tile) }
  .people li.mine { background: var(--accent-light) }
  .place { flex: 0 0 34px; color: var(--muted); font-variant-numeric: tabular-nums; text-align: right }
  .podium .place { color: var(--ink); font-size: 15px; font-weight: 600 }
  .avatar { display: grid; flex: 0 0 30px; place-items: center; height: 30px; border-radius: 50%; background: var(--accent-light); color: var(--accent); font-size: 13px; font-weight: 600 }
  .mine .avatar { background: var(--surface) }
  .avatar.unnamed { background: var(--surface-sunken); color: var(--muted); font-weight: 400 }
  .name { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
  .name::after { content: ''; position: absolute; inset: 0 }
  .people li:hover .name { text-decoration: underline; text-underline-offset: 3px }
  .total { flex: 0 0 auto; font-weight: 500; font-variant-numeric: tabular-nums }
  .more { align-self: start }
  @media (max-width: 700px) { .people li { gap: 10px; padding-inline: 2px } .place { flex-basis: 24px } }
</style>
