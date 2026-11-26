<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import { day, href, t } from '$lib/t'
  let { data } = $props()
</script>

<Seo title={t('imports.title')} />
<div class="page narrow stack">
  <h1>{t('imports.title')}</h1>
  {#if data.imports.length}
    <ul class="imports">
      {#each data.imports as item (item.id)}
        <li>
          <a class="item" href={href(`/imports/${item.id}`)}>
            <span class="main">
              <span class="name">{item.name}</span>
              <span class="meta">
                <time datetime={item.created_at}>{day(item.created_at)}</time>
                {#if item.by_name}<span aria-hidden="true">·</span><span>{item.by_name}</span>{/if}
              </span>
            </span>
            <span class="counts">
              {#if item.pending > 0}
                <span class="badge review">{t('imports.pendingCount', { n: item.pending })}</span>
              {:else}
                <span class="badge reviewed">{t('imports.allReviewed')}</span>
              {/if}
              <span class="total">{t('imports.totalCount', { n: item.total })}</span>
            </span>
          </a>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="empty muted">{t('imports.empty')}</p>
  {/if}
  {#if data.next !== null}<a class="button more" href="?after={data.next}">{t('browse.more')}</a>{/if}
</div>

<style>
  .imports { display: flex; flex-direction: column; gap: 10px; margin: 0; padding: 0; list-style: none }
  .item { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 16px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface) }
  .item:hover { border-color: var(--line-strong) }
  .main { display: flex; flex-direction: column; gap: 4px; min-width: 0 }
  .name { font-size: 15px; font-weight: 600; overflow-wrap: anywhere }
  .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12.5px; color: var(--muted) }
  .counts { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; flex: none; font-variant-numeric: tabular-nums }
  .badge.review { background: var(--uncertain-badge); color: var(--uncertain-ink) }
  .badge.reviewed { background: var(--good-light); color: var(--good) }
  .total { font-size: 12.5px; color: var(--muted) }
  .empty { padding: 48px 16px; text-align: center }
  .more { align-self: start }
</style>
