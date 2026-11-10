<script lang="ts">
  import RevisionFields from './RevisionFields.svelte'
  import type { EntryFields, SightingFields } from '$lib/server/entries'
  import { href, t, when } from '$lib/t'

  type Row = {
    id: number; entry_id: number; sighting_id: number | null; kind: string; rev: number
    summary: string | null; at: string; by_id: string; by_name: string; ids?: string | null
    fields: EntryFields | null; sightingFields: SightingFields | null; sightingRev?: number | null
  }

  let { rows, currentRev = null, showEntry = false, showActor = true, restore = false, empty, next = null }: {
    rows: Row[]; currentRev?: number | null; showEntry?: boolean; showActor?: boolean; restore?: boolean; empty: string; next?: number | null
  } = $props()

  const stop = (event: MouseEvent) => event.stopPropagation()
</script>

{#snippet line(row: Row)}
  <time class="revision-time" datetime={row.at}>{when(row.at)}</time>
  {#if showActor}
    <span class="revision-actor">
      {#if row.by_name}<a class="text-link" href={href(`/u/${row.by_id}`)} onclick={stop}>{row.by_name}</a>{:else}—{/if}
    </span>
  {/if}
  <span class="revision-change">
    <span class="revision-main">
      <span class="revision-kind">{t(`history.kind.${row.kind}`)}</span>
      {#if showEntry}<a class="revision-entry" href={href(`/entry/${row.entry_id}`)} onclick={stop}>{row.ids || t('entry.record', { id: row.entry_id })}</a>{/if}
      {#if row.sighting_id}<span class="revision-number">#{row.sighting_id}</span>{/if}
    </span>
    {#if row.summary}<span class="revision-comment">{row.summary}</span>{/if}
  </span>
  <span class="revision-rev">{row.rev ? `r${row.rev}` : ''}</span>
  <span class="revision-toggle" aria-hidden="true"></span>
{/snippet}

{#if !rows.length && !next}<p class="muted">{empty}</p>{/if}
<ol class="revision-list">
  {#each rows as row (row.id)}
    {#if row.fields || row.sightingFields}
      <li class="revision">
        <details>
          <summary class="revision-row">{@render line(row)}</summary>
          <div class="revision-body">
            {#if row.fields}<RevisionFields fields={row.fields} />{/if}
            {#if row.sightingFields}<RevisionFields fields={row.sightingFields} sighting />{/if}
            {#if restore}
              {#if row.fields && currentRev}
                <form class="revision-action" method="POST" action="?/restore">
                  <input type="hidden" name="revision" value={row.id} />
                  <input type="hidden" name="rev" value={currentRev} />
                  <button class="button" type="submit">{t('history.restore')}</button>
                </form>
              {:else if row.sightingFields && row.sightingRev}
                <form class="revision-action" method="POST" action="?/restore">
                  <input type="hidden" name="revision" value={row.id} />
                  <input type="hidden" name="sighting" value={row.sighting_id} />
                  <input type="hidden" name="rev" value={row.sightingRev} />
                  <button class="button" type="submit">{t('history.restoreSighting')}</button>
                </form>
              {/if}
            {/if}
          </div>
        </details>
      </li>
    {:else}
      <li class="revision"><div class="revision-row static">{@render line(row)}</div></li>
    {/if}
  {/each}
</ol>
{#if next}<div class="revision-more"><a class="button" href={`?before=${next}`}>{t('recent.older')}</a></div>{/if}

<style>
  .revision-list { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line) }
  .revision { border-bottom: 1px solid var(--line) }
  .revision-row {
    display: flex; align-items: baseline; gap: 16px; width: 100%; padding: 12px 4px;
    list-style: none; cursor: pointer; font-size: 13px; text-align: left;
  }
  .revision-row.static { cursor: default }
  .revision-row::-webkit-details-marker { display: none }
  .revision-row:hover { background: var(--surface-tile) }
  .revision-row.static:hover { background: none }
  .revision-time { flex: 0 0 148px; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap }
  .revision-actor { flex: 0 0 140px; min-width: 0; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
  .revision-actor a { color: var(--ink) }
  .revision-change { display: flex; flex: 1 1 0; flex-direction: column; gap: 2px; min-width: 0 }
  .revision-main { display: flex; flex-wrap: wrap; align-items: baseline; gap: 3px 7px; min-width: 0 }
  .revision-kind { font-weight: 500 }
  .revision-entry { font-weight: 500; overflow-wrap: anywhere }
  .revision-number { color: var(--muted); font-size: 11.5px; white-space: nowrap }
  .revision-comment { overflow: hidden; color: var(--muted); font-size: 12.5px; text-overflow: ellipsis; white-space: nowrap }
  .revision-rev { flex: 0 0 36px; color: var(--muted); font-size: 11.5px; font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap }
  .revision-toggle { flex: 0 0 16px; color: var(--muted); font-size: 16px; line-height: 1; text-align: center }
  details .revision-toggle::before { content: '+' }
  details[open] .revision-toggle::before { content: '−' }
  details[open] > .revision-row { background: var(--surface-tile) }
  .revision-body { padding: 18px 16px 20px; border-top: 1px solid var(--line); background: var(--surface-sunken) }
  .revision-action { display: flex; justify-content: flex-end; margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--line) }
  .revision-more { margin-top: 18px }
  @media (max-width: 700px) {
    .revision-row { flex-wrap: wrap; gap: 2px 10px; padding: 12px 2px }
    .revision-time { flex: 0 0 auto }
    .revision-actor { flex: 1 1 auto; order: 2 }
    .revision-toggle { order: 3; margin-left: auto }
    .revision-rev { display: none }
    .revision-change { flex: 1 0 100%; order: 4 }
    .revision-comment { white-space: normal }
    .revision-body { padding: 16px 12px 18px }
  }
</style>
