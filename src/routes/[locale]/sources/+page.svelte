<script lang="ts">
  import PublisherField from '$lib/components/PublisherField.svelte'
  import EvidenceDate from '$lib/components/EvidenceDate.svelte'
  import Seo from '$lib/components/Seo.svelte'
  import IdsGlyph from '$lib/components/IdsGlyph.svelte'
  import { href, media, t } from '$lib/t'
  import { recordCode } from '$lib/code'
  import { SOURCE_SORTS } from '$lib/order'
  let { data } = $props()
  const host = (url: string | null) => { try { return url ? new URL(url).host : null } catch { return null } }
  const count = (n: number) => t(n === 1 ? 'source.record' : 'source.records', { n })
  const sorted = (sort: string, after?: string | null, publisher = data.publisher) => {
    const query = new URLSearchParams()
    if (sort !== 'new') query.set('sort', sort)
    if (publisher) query.set('publisher', publisher)
    if (after) query.set('after', after)
    return query.size ? `?${query}` : href('/sources')
  }
</script>

<Seo title={t('nav.sources')} />
<div class="page stack">
  <h1>{t('nav.sources')}</h1>
  <search>
    <form class="publisher-filter" action={href('/sources')} method="GET">
      {#if data.sort !== 'new'}<input type="hidden" name="sort" value={data.sort} />{/if}
      {#key data.publisher}<PublisherField id="publisher" name="publisher" value={data.publisher} />{/key}
      <button type="submit" class="button">{t('sources.filter')}</button>
      {#if data.publisher}<a class="text-link" href={sorted(data.sort, null, '')}>{t('sources.clear')}</a>{/if}
    </form>
  </search>
  <nav class="sort" aria-label={t('sources.sort')}>
    {#each SOURCE_SORTS as sort}<a class="chip" class:on={data.sort === sort} aria-current={data.sort === sort ? 'true' : undefined} href={sorted(sort)}>{t(`sources.sort.${sort}`)}</a>{/each}
  </nav>
  {#if data.sources.length}
    <div class="cards">
      {#each data.sources as source (source.id)}
        {@const name = source.title || host(source.url) || source.url || t('source.title')}
        {@const byline = [source.author, source.publisher].filter(Boolean).join(' · ')}
        <article class="card">
          <a class="cover" href={href(`/source/${source.id}`)} tabindex="-1" aria-hidden="true">
            {#if source.cover}<img src={media(source.cover)} alt="" loading="lazy" decoding="async" />{:else}<span class="blank">{t('browse.noImage')}</span>{/if}
          </a>
          <div class="body">
            <h2 class="name"><a href={href(`/source/${source.id}`)}>{name}</a></h2>
            {#if byline || source.report_date}<span class="byline">{byline}{#if byline && source.report_date} · {/if}<EvidenceDate text={source.report_date} reading={data.dates.get(source.report_date ?? '')} /></span>{/if}
            {#if source.title && host(source.url)}<span class="byline">{host(source.url)}</span>{/if}
            <span class="count">{count(source.records)}</span>
          </div>
          <div class="records">
            {#each source.tiles as tile (tile.id)}
              {@const label = [tile.ids, recordCode(tile.id)].filter(Boolean).join(' ')}
              <a class="record" href={href(`/entry/${tile.id}`)} title={label}>
                {#if tile.ids}<IdsGlyph ids={tile.ids} layout={tile.layout} path={data.glyphs?.[tile.id]} /><span class="sr-only">{label}</span>
                {:else if tile.cover_key}<img src={media(tile.cover_key)} alt={t('entry.record', { id: recordCode(tile.id) })} loading="lazy" decoding="async" />
                {:else}<span class="code">{recordCode(tile.id)}</span>{/if}
              </a>
            {/each}
          </div>
        </article>
      {/each}
    </div>
  {:else if data.next === null}
    <p class="empty muted">{t(data.publisher ? 'sources.noPublisherMatches' : 'sources.empty')}</p>
  {/if}
  {#if data.next !== null}<a class="button more" href={sorted(data.sort, data.next)}>{t('browse.more')}</a>{/if}
</div>

<style>
  .publisher-filter { display:flex; flex-wrap:wrap; gap:8px; align-items:end }
  .publisher-filter :global(.field) { width:min(100%, 22rem) }
  .publisher-filter .text-link { align-self:end; padding:8px }
  .sort { display:flex; flex-wrap:wrap; gap:4px }
  .cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr)); gap:20px }
  .card { display:flex; flex-direction:column; min-width:0; border:1px solid var(--line); border-radius:10px; background:var(--surface); overflow:hidden }
  .cover { display:grid; place-items:center; aspect-ratio:16/10; background:var(--surface-sunken); overflow:hidden }
  .cover img { width:100%; height:100%; object-fit:cover; display:block }
  .card:hover .cover img { opacity:.9 }
  .blank { color:var(--muted); font-size:12px }
  .body { display:flex; flex-direction:column; gap:2px; padding:12px 14px 0; min-width:0 }
  .name { margin:0; font-size:14px; font-weight:600; line-height:1.35; overflow-wrap:anywhere; display:-webkit-box; -webkit-line-clamp:2; line-clamp:2; -webkit-box-orient:vertical; overflow:hidden }
  .name a:hover { text-decoration:underline }
  .byline { color:var(--muted); font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
  .records { display:flex; flex-wrap:wrap; align-items:center; gap:4px; padding:12px 14px 14px; margin-top:auto }
  .record { display:grid; place-items:center; width:36px; height:36px; border-radius:6px; background:var(--surface-tile); color:var(--ink); overflow:hidden }
  .record:hover { outline:2px solid var(--line-strong); outline-offset:1px }
  .record img { width:100%; height:100%; object-fit:contain }
  .record :global(.sequence) { font-size:11px; padding:2px }
  .code { font-size:9px; color:var(--muted) }
  .count { margin-top:4px; font-size:12px; font-weight:500 }
  .empty { padding:48px 16px; text-align:center }
  .more { align-self:start }
</style>
