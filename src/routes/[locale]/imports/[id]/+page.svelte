<script lang="ts">
  import IdsGlyph from '$lib/components/IdsGlyph.svelte'
  import Seo from '$lib/components/Seo.svelte'
  import { recordCode } from '$lib/code'
  import { scriptName } from '$lib/scripts'
  import { day, href, locale, media, t } from '$lib/t'
  let { data } = $props()
</script>

<Seo title={data.batch.name} />
<div class="page stack">
  <a class="text-link back" href={href('/imports')}>← {t('imports.title')}</a>
  <div class="heading stack">
    <h1>{data.batch.name}</h1>
    <div class="meta row">
      <time datetime={data.batch.created_at}>{day(data.batch.created_at)}</time>
      {#if data.batch.by_name}<span aria-hidden="true">·</span><span>{data.batch.by_name}</span>{/if}
      <span aria-hidden="true">·</span>
      {#if data.batch.pending > 0}
        <span class="badge review">{t('imports.pendingCount', { n: data.batch.pending })}</span>
      {:else}
        <span class="badge reviewed">{t('imports.allReviewed')}</span>
      {/if}
      <span>{t('imports.totalCount', { n: data.batch.total })}</span>
    </div>
  </div>
  <nav class="tabs row" aria-label={t('imports.title')}>
    <a class="chip" class:on={data.view === 'pending'} aria-current={data.view === 'pending' ? 'page' : undefined} href={href(`/imports/${data.batch.id}`)}>
      {t('review.awaiting')} <span class="n">{data.batch.pending}</span>
    </a>
    <a class="chip" class:on={data.view === 'all'} aria-current={data.view === 'all' ? 'page' : undefined} href={href(`/imports/${data.batch.id}?view=all`)}>
      {t('imports.allRecords')} <span class="n">{data.batch.total}</span>
    </a>
  </nav>
  {#if data.entries.length}
    <ul class="records">
      {#each data.entries as record (record.id)}
        <li class="record">
          <a class="plates" href={href(`/entry/${record.id}`)} aria-label={t('entry.record', { id: recordCode(record.id) })}>
            <span class="plate">
              {#if record.ids}<IdsGlyph ids={record.ids} layout={record.layout} path={data.glyphs?.[record.id]} />
              {:else if record.cover_key}<img src={media(record.cover_key)} alt="" loading="lazy" decoding="async" />
              {:else}<span class="blank">{t('browse.noImage')}</span>{/if}
            </span>
            {#if record.ids && record.cover_key}
              <span class="plate"><img src={media(record.cover_key)} alt="" loading="lazy" decoding="async" /></span>
            {/if}
          </a>
          <div class="info">
            <div class="row about">
              <a class="code" href={href(`/entry/${record.id}`)}>{recordCode(record.id)}</a>
              {#if record.ids}<span class="ids">{record.ids}</span>{/if}
            </div>
            <div class="row badges">
              <span class="badge">{scriptName(locale(), record.script, record.script_other)}</span>
              {#if record.status}<span class="badge {record.status}">{t(`browse.${record.status}`)}</span>{/if}
              {#if record.awaitingReview}
                <span class="badge review">{t('review.awaiting')}</span>
              {:else}
                <span class="badge reviewed">{t('review.reviewed')}</span>
              {/if}
              <span class="count">{t(record.sightings === 1 ? 'browse.sighting' : 'browse.sightings', { n: record.sightings })}</span>
            </div>
          </div>
          <form class="action" method="POST" action="?/review">
            <input type="hidden" name="entry" value={record.id} />
            <input type="hidden" name="reviewed" value={record.awaitingReview ? '1' : '0'} />
            <input type="hidden" name="view" value={data.view} />
            <button class="button small" class:primary={record.awaitingReview} type="submit">
              {t(record.awaitingReview ? 'review.markReviewed' : 'review.unmark')}
            </button>
          </form>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="empty muted">{t(data.view === 'pending' ? 'imports.emptyPending' : 'imports.emptyRecords')}</p>
  {/if}
  {#if data.next !== null}
    <a class="button more" href={data.view === 'all' ? `?view=all&after=${data.next}` : `?after=${data.next}`}>{t('browse.more')}</a>
  {/if}
</div>

<style>
  .back { align-self: start; color: var(--muted) }
  .heading { gap: 8px }
  .meta { font-size: 13px; color: var(--muted); font-variant-numeric: tabular-nums }
  .tabs { gap: 4px }
  .tabs .n { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums }
  .records { display: flex; flex-direction: column; gap: 10px; margin: 0; padding: 0; list-style: none }
  .record { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface) }
  .plates { display: flex; gap: 6px; flex: none }
  .plate { display: grid; place-items: center; width: 64px; height: 64px; overflow: hidden; border-radius: 6px; background: var(--surface-tile); color: var(--ink) }
  .plates:hover .plate { outline: 2px solid var(--line-strong); outline-offset: 1px }
  img { display: block; width: 100%; height: 100%; object-fit: contain }
  .blank { padding: 4px; color: var(--muted); font-size: 10.5px; text-align: center }
  .info { display: flex; flex-direction: column; gap: 6px; flex: 1 1 200px; min-width: 0 }
  .about { gap: 8px }
  .code { font-weight: 600; font-variant-numeric: tabular-nums }
  .code:hover { text-decoration: underline }
  .badges { gap: 6px }
  .badge.review { background: var(--uncertain-badge); color: var(--uncertain-ink) }
  .badge.reviewed { background: var(--good-light); color: var(--good) }
  .count { font-size: 12px; color: var(--muted) }
  .action { flex: none; margin-inline-start: auto }
  .button.small { min-height: 34px; padding: 5px 12px; font-size: 12.5px }
  .empty { padding: 48px 16px; text-align: center }
  .more { align-self: start }
</style>
