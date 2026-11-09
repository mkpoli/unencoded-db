<script lang="ts">
  import { localizedHref, t, type Locale } from '$lib/i18n'
  import { isHanScript } from '$lib/script'

  type Entry = { id: number; script: string; ids: string | null; place: string }
  type ScriptCount = { script: string; n: number }
  let { data }: { data: { locale: Locale; entries: Entry[]; next: number | null; scripts: ScriptCount[]; total: number; script: string | null } } = $props()

  const tabHref = (script?: string) => `${localizedHref(data.locale)}${script === undefined ? '' : `?script=${encodeURIComponent(script)}`}`
  const moreHref = $derived(`${localizedHref(data.locale)}?${new URLSearchParams({ ...(data.script === null ? {} : { script: data.script }), before: String(data.next) })}`)
</script>

<svelte:head><title>{t(data.locale, 'app.name')}</title></svelte:head>
<div class="page-heading">
  <h1>{t(data.locale, 'app.name')}</h1>
  <p>{t(data.locale, 'app.tagline')}</p>
  <p><a class="quiet-link" href="/export.json">{t(data.locale, 'browse.export')}</a></p>
</div>
<nav class="script-tabs" aria-label={t(data.locale, 'field.script')}>
  <a class="script-tab" aria-current={data.script === null ? 'page' : undefined} href={tabHref()}>
    <span class="script-name">{t(data.locale, 'browse.all')}</span> <span class="script-count">{data.total}</span>
  </a>
  {#each data.scripts as item (item.script)}
    <a class="script-tab" aria-current={data.script === item.script ? 'page' : undefined} href={tabHref(item.script)} title={item.script}>
      <span class="script-name">{item.script}</span> <span class="script-count">{item.n}</span>
    </a>
  {/each}
</nav>
{#if data.entries.length}
  <div class="card-grid">
    {#each data.entries as entry (entry.id)}
      <a class="entry-card" href={localizedHref(data.locale, `/entry/${entry.id}`)}>
        <span class="script-tag" class:han={isHanScript(entry.script)} title={entry.script}>{entry.script}</span>
        <span class="glyph">{entry.ids || entry.script}</span>
        <span class="place">{entry.place}</span>
        <span class="record">#{entry.id}</span>
      </a>
    {/each}
  </div>
  {#if data.next}
    <div class="more-row">
      <a class="secondary" href={moreHref}>{t(data.locale, 'browse.more')} →</a>
    </div>
  {/if}
{:else}
  <div class="empty-state">
    <span class="empty-mark" aria-hidden="true">字</span>
    {#if data.script === null}
      <p>{t(data.locale, 'browse.emptyAll')}</p>
      <a class="primary" href={localizedHref(data.locale, '/new')}>{t(data.locale, 'browse.addOne')} <span aria-hidden="true">→</span></a>
    {:else}
      <p>{t(data.locale, 'browse.emptyScript')}</p>
      <a class="secondary" href={tabHref()}>{t(data.locale, 'browse.all')}</a>
    {/if}
  </div>
{/if}
