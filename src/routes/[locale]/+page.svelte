<script lang="ts">
  import IdsGlyph from '$lib/components/IdsGlyph.svelte'
  import { localizedHref, t, type Locale } from '$lib/i18n'
  import { isHanScript } from '$lib/script'

  type Entry = { id: number; script: string; ids: string | null; evidence: number; first_year: number | null; category: string | null }
  type ScriptCount = { script: string; n: number }
  type IvdFilter = 'registered' | 'none'
  let { data }: { data: { locale: Locale; entries: Entry[]; next: number | null; glyphs?: Record<string, string>; scripts?: ScriptCount[]; total?: number; script?: string | null; ivd?: IvdFilter | null } } = $props()

  const listingHref = (overrides: { script?: string | null; ivd?: IvdFilter | null; before?: number | null } = {}) => {
    const script = 'script' in overrides ? overrides.script : (data.script ?? null)
    const ivd = 'ivd' in overrides ? overrides.ivd : (data.ivd ?? null)
    const params = new URLSearchParams()
    if (script) params.set('script', script)
    if (ivd) params.set('ivd', ivd)
    if (overrides.before) params.set('before', String(overrides.before))
    const text = params.toString()
    return `${localizedHref(data.locale)}${text ? `?${text}` : ''}`
  }
  const moreHref = $derived(listingHref({ before: data.next }))
</script>

<svelte:head><title>{t(data.locale, 'app.name')}</title></svelte:head>
<div class="page-heading">
  <h1>{t(data.locale, 'app.name')}</h1>
  <p>{t(data.locale, 'app.tagline')}</p>
  <p><a class="quiet-link" href="/export.json">{t(data.locale, 'browse.export')}</a></p>
</div>
<nav class="script-tabs" aria-label={t(data.locale, 'field.script')}>
  <a class="script-tab" aria-current={(data.script ?? null) === null ? 'page' : undefined} href={listingHref({ script: null })}>
    <span class="script-name">{t(data.locale, 'browse.all')}</span> <span class="script-count">{data.total}</span>
  </a>
  {#each data.scripts ?? [] as item (item.script)}
    <a class="script-tab" aria-current={data.script === item.script ? 'page' : undefined} href={listingHref({ script: item.script })} title={item.script}>
      <span class="script-name">{item.script}</span> <span class="script-count">{item.n}</span>
    </a>
  {/each}
</nav>
<nav class="script-tabs" aria-label={t(data.locale, 'field.ivd')}>
  <a class="script-tab" aria-current={(data.ivd ?? null) === null ? 'page' : undefined} href={listingHref({ ivd: null })}>{t(data.locale, 'browse.all')}</a>
  <a class="script-tab" aria-current={data.ivd === 'registered' ? 'page' : undefined} href={listingHref({ ivd: 'registered' })}>{t(data.locale, 'field.ivdRegistered')}</a>
  <a class="script-tab" aria-current={data.ivd === 'none' ? 'page' : undefined} href={listingHref({ ivd: 'none' })}>{t(data.locale, 'field.ivdNone')}</a>
</nav>
{#if data.entries.length}
  <div class="card-grid gallery">
    {#each data.entries as entry (entry.id)}
      {@const glyph = entry.ids ? data.glyphs?.[entry.ids] : undefined}
      <a class="entry-card gallery-card" href={localizedHref(data.locale, `/entry/${entry.id}`)}>
        <span class="script-tag" class:han={isHanScript(entry.script)} title={entry.script}>{entry.script}</span>
        <span class="glyph"><IdsGlyph ids={entry.ids} text={entry.ids || entry.script} path={glyph} /></span>
        {#if entry.ids}<span class="visually-hidden">{entry.ids}</span>{/if}
        {#if entry.category}<span class="category">{entry.category}</span>{/if}
        <span class="summary">
          <span>{entry.evidence === 1 ? t(data.locale, 'browse.source', { n: entry.evidence }) : t(data.locale, 'browse.sources', { n: entry.evidence })}</span>
          {#if entry.first_year}<span aria-hidden="true">·</span><span>{entry.first_year}</span>{/if}
        </span>
        <span class="record">#{entry.id}</span>
      </a>
    {/each}
    <a class="add-card" href={localizedHref(data.locale, '/new')}>
      <span class="add-mark" aria-hidden="true">+</span>
      <span class="add-label">{t(data.locale, 'browse.addOne')}</span>
    </a>
  </div>
  {#if data.next}
    <div class="more-row">
      <a class="secondary" href={moreHref}>{t(data.locale, 'browse.more')} →</a>
    </div>
  {/if}
{:else}
  <div class="empty-state">
    <span class="empty-mark" aria-hidden="true">字</span>
    {#if (data.ivd ?? null) !== null}
      <p>{t(data.locale, 'browse.emptyIvd')}</p>
      <a class="secondary" href={listingHref({ ivd: null })}>{t(data.locale, 'browse.all')}</a>
    {:else if (data.script ?? null) === null}
      <p>{t(data.locale, 'browse.emptyAll')}</p>
      <a class="primary" href={localizedHref(data.locale, '/new')}>{t(data.locale, 'browse.addOne')} <span aria-hidden="true">→</span></a>
    {:else}
      <p>{t(data.locale, 'browse.emptyScript')}</p>
      <a class="secondary" href={listingHref({ script: null })}>{t(data.locale, 'browse.all')}</a>
    {/if}
  </div>
{/if}
