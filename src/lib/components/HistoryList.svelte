<script lang="ts">
  import type { DateReading } from '$lib/dates'
  import AgentBadge from './AgentBadge.svelte'
  import RevisionFields from './RevisionFields.svelte'
  import { localized, tagLabels, type Tag } from '$lib/tags'
  import type { EntryFields, SightingFields } from '$lib/server/entries'
  import { enhance } from '$app/forms'
  import { href, locale, t, when } from '$lib/t'
  import { recordCode } from '$lib/code'

  type Row = {
    id: number; entry_id: number; sighting_id: number | null; kind: string; rev: number
    summary: string | null; at: string; by_id: string; by_name: string; by_agent?: string | null; by_model?: string | null; ids?: string | null
    fields: EntryFields | null; sightingFields: SightingFields | null; sightingRev?: number | null
    redacted?: boolean; redacted_at?: string | null; removed?: boolean | number
    merge?: { from: number } | { into: number } | null
    moved?: { sighting: number; to?: number; from?: number } | null
  }

  // A run of changes one writer made in quick succession, shown as one line that opens to list them.
  type Run = {
    run: number; count: number; from: string; to: string; by_id: string; by_name: string; by_agent?: string | null; by_model?: string | null
    kinds: [string, number][]; summary: string | null
    lines: { id: number; entry_id: number; sighting_id: number | null; kind: string; summary: string | null; at: string; ids: string | null; removed: number }[]
  }

  let { rows: given = [], items = null, newer = null, paged = false, tags, dates, currentRev = null, duplicates = [], showEntry = false, showActor = true, restore = false, redact = false, thank = false, thanked = [], viewer = null, empty, next = null, query = '' }: {
    dates: Map<string, DateReading | null>; rows?: Row[]; items?: (Row | Run)[] | null; newer?: number | null; paged?: boolean; tags: Pick<Tag, 'name' | 'label' | 'type'>[]; currentRev?: number | null; duplicates?: number[]; showEntry?: boolean; showActor?: boolean; restore?: boolean; redact?: boolean; thank?: boolean; thanked?: number[]; viewer?: string | null; empty: string; next?: number | null; query?: string
  } = $props()
  const list = $derived<(Row | Run)[]>(items ?? given)
  const rows = $derived(list.filter((item): item is Row => !('run' in item)))
  const labels = $derived(tagLabels(localized(tags, locale())))
  const tagTypes = $derived(new Map(tags.map(tag => [tag.name, tag.type])))

  // The state a record or a sighting holds now stays; only a past one can be redacted.
  const past = (row: Row) => row.fields ? row.rev !== currentRev : row.sightingRev != null && row.rev !== row.sightingRev

  const thankedFor = $derived(new Set(thanked))

  const stop = (event: MouseEvent) => event.stopPropagation()

  // The newest merge of each duplicate that is still joined to the record is the one that can be undone.
  const undoable = $derived(new Map(duplicates.flatMap(id => {
    const row = rows.find(row => row.kind === 'merge' && row.merge && 'from' in row.merge && row.merge.from === id)
    return row ? [[row.id, id] as const] : []
  })))
</script>

{#snippet line(row: Row)}
  <time class="revision-time" datetime={row.at}>{when(row.at)}</time>
  {#if showActor}
    <span class="revision-actor">
      {#if row.by_name}
        <a class="text-link actor-name" href={href(`/u/${row.by_id}`)} onclick={stop}>{row.by_name}</a>
        {#if row.by_agent}<AgentBadge name={row.by_agent} model={row.by_model ?? null} standalone={row.by_agent === row.by_name} />{/if}
      {:else}—{/if}
    </span>
  {/if}
  <span class="revision-change">
    <span class="revision-main">
      <span class="revision-kind">{t(`history.kind.${row.kind}`)}</span>
      {#if showEntry}<a class="revision-entry text-link" href={href(`/entry/${row.entry_id}`)} onclick={stop}>{row.ids || t('entry.record', { id: recordCode(row.entry_id) })}</a>{/if}
      {#if row.sighting_id && row.removed}<span class="revision-number">#{row.sighting_id}</span>
      {:else if row.sighting_id}<a class="revision-number" href={href(`/entry/${row.entry_id}#sighting-${row.sighting_id}`)} onclick={stop}>#{row.sighting_id}</a>{/if}
      {#if row.merge}{@const other = 'from' in row.merge ? row.merge.from : row.merge.into}<a class="revision-number" href={href(`/entry/${other}`)} onclick={stop}>{t('from' in row.merge ? 'history.mergedFrom' : 'history.mergedTo', { id: recordCode(other) })}</a>{/if}
      {#if row.moved}{@const holder = row.moved.to ?? row.entry_id}<a class="revision-number" href={href(`/entry/${holder}#sighting-${row.moved.sighting}`)} onclick={stop}>#{row.moved.sighting}</a><a class="revision-number" href={href(`/entry/${row.moved.to ?? row.moved.from}`)} onclick={stop}>{t(row.moved.to ? 'history.movedTo' : 'history.movedFrom', { id: recordCode((row.moved.to ?? row.moved.from)!) })}</a>{/if}
      {#if !showActor && row.by_agent}<AgentBadge name={row.by_agent} model={row.by_model ?? null} standalone={row.by_agent === row.by_name} />{/if}
    </span>
    {#if row.redacted || row.redacted_at}<span class="revision-comment">{t('history.redacted')}</span>{:else if row.summary}<span class="revision-comment">{row.summary}</span>{/if}
  </span>
  {#if redact && row.kind === 'remove' && row.summary}
    <form class="redact-reason" method="POST" action="?/redact">
      <input type="hidden" name="revision" value={row.id} />
      <button class="button small danger" type="submit">{t('history.redactReason')}</button>
    </form>
  {/if}
  {#if thank && row.removed}<span class="revision-thank"></span>
  {:else if thank}
    <span class="revision-thank">
      {#if thankedFor.has(row.id)}<span class="thanked">{t('history.thanked')}</span>
      {:else if row.by_id && row.by_id !== viewer}
        <form method="POST" action="?/thank" use:enhance={() => ({ update }) => update({ reset: false })}>
          <input type="hidden" name="revision" value={row.id} />
          <button class="thank" type="submit" onclick={stop}>{t('history.thank')}</button>
        </form>
      {/if}
    </span>
  {/if}
  <span class="revision-rev">{row.rev ? `r${row.rev}` : ''}</span>
  <span class="revision-toggle" aria-hidden="true"></span>
{/snippet}

{#snippet undo(from: number)}
  <form class="revision-action" method="POST" action="?/unmerge">
    <input type="hidden" name="from" value={from} />
    <button class="button" type="submit">{t('history.unmerge')}</button>
  </form>
{/snippet}

{#snippet pager()}
  {#if paged || newer || next}
    <nav class="revision-more" aria-label={t('history.pages')}>
      {#if paged}<a class="button" href={query ? `?${query.slice(0, -1)}` : '?'}>{t('history.newest')}</a>{/if}
      {#if newer}<a class="button" href={`?${query}after=${newer}`}>{t('history.newer')}</a>{/if}
      {#if next}<a class="button" href={`?${query}before=${next}`}>{t('history.older')}</a>{/if}
    </nav>
  {/if}
{/snippet}

{#snippet cluster(run: Run)}
  <li class="revision">
    <details>
      <summary class="revision-row">
        <time class="revision-time" datetime={run.to}>{when(run.to)}</time>
        {#if showActor}
          <span class="revision-actor">
            <a class="text-link actor-name" href={href(`/u/${run.by_id}`)} onclick={stop}>{run.by_name}</a>
            {#if run.by_agent}<AgentBadge name={run.by_agent} model={run.by_model ?? null} standalone={run.by_agent === run.by_name} />{/if}
          </span>
        {/if}
        <span class="revision-change">
          <span class="revision-main">
            <span class="revision-kind">{t('history.changes', { count: run.count })}</span>
            {#each run.kinds as [kind, count] (kind)}<span class="revision-number">{t(`history.kind.${kind}`)} ×{count}</span>{/each}
            {#if !showActor && run.by_agent}<AgentBadge name={run.by_agent} model={run.by_model ?? null} standalone={run.by_agent === run.by_name} />{/if}
          </span>
          {#if run.summary}<span class="revision-comment">{run.summary}</span>{/if}
        </span>
        <span class="revision-rev"></span>
        <span class="revision-toggle" aria-hidden="true"></span>
      </summary>
      <ol class="run-lines">
        {#each run.lines as line (line.id)}
          <li>
            <time datetime={line.at}>{when(line.at)}</time>
            <span class="run-change">
              <span>{t(`history.kind.${line.kind}`)}</span>
              <a class="text-link" href={href(`/entry/${line.entry_id}`)}>{line.ids || t('entry.record', { id: recordCode(line.entry_id) })}</a>
              {#if line.sighting_id && !line.removed}<a class="revision-number" href={href(`/entry/${line.entry_id}#sighting-${line.sighting_id}`)}>#{line.sighting_id}</a>{/if}
              {#if line.summary && !run.summary}<span class="revision-comment">{line.summary}</span>{/if}
            </span>
          </li>
        {/each}
        {#if run.count > run.lines.length}<li class="muted">+{run.count - run.lines.length}</li>{/if}
      </ol>
    </details>
  </li>
{/snippet}

{#if !list.length && !next}<p class="muted">{empty}</p>{/if}
{#if paged}{@render pager()}{/if}
<ol class="revision-list">
  {#each list as row ('run' in row ? `run-${row.run}` : row.id)}
    {#if 'run' in row}{@render cluster(row)}
    {:else if row.fields || row.sightingFields}
      <li class="revision">
        <details>
          <summary class="revision-row">{@render line(row)}</summary>
          <div class="revision-body">
            {#if !showEntry}
              <div class="revision-links">
                <a class="text-link" href={href(`/entry/${row.entry_id}`)}>{t('entry.record', { id: recordCode(row.entry_id) })}</a>
              </div>
            {/if}
            {#if row.fields}<RevisionFields fields={row.fields} {labels} {tagTypes} />{/if}
            {#if row.sightingFields}<RevisionFields fields={row.sightingFields} {dates} sighting />{/if}
            {#if restore}
              {#if row.fields && currentRev}
                <form class="revision-action" method="POST" action="?/restore">
                  <input type="hidden" name="revision" value={row.id} />
                  <input type="hidden" name="rev" value={currentRev} />
                  <button class="button" type="submit">{t('history.restore')}</button>
                </form>
              {:else if row.sightingFields && row.sightingRev && !row.removed}
                <form class="revision-action" method="POST" action="?/restore">
                  <input type="hidden" name="revision" value={row.id} />
                  <input type="hidden" name="sighting" value={row.sighting_id} />
                  <input type="hidden" name="rev" value={row.sightingRev} />
                  <button class="button" type="submit">{t('history.restoreSighting')}</button>
                </form>
              {/if}
            {/if}
            {#if undoable.has(row.id)}{@render undo(undoable.get(row.id)!)}{/if}
            {#if redact && past(row)}
              <form class="revision-action redact" method="POST" action="?/redact">
                <input type="hidden" name="revision" value={row.id} />
                <input class="input" name="summary" maxlength="500" aria-label={t('form.summary')} placeholder={t('form.summary')} />
                <button class="button danger" type="submit">{t('history.redact')}</button>
              </form>
            {/if}
          </div>
        </details>
      </li>
    {:else}
      <li class="revision"><div class="revision-row static">{@render line(row)}</div>{#if undoable.has(row.id)}<div class="revision-body">{@render undo(undoable.get(row.id)!)}</div>{/if}</li>
    {/if}
  {/each}
</ol>
{@render pager()}

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
  .revision-actor { display: flex; flex: 0 0 clamp(185px, 34%, 262px); flex-direction: column; align-items: flex-start; gap: 3px; min-width: 0; color: var(--muted) }
  .actor-name { max-inline-size: 100%; overflow: hidden; color: var(--ink); text-overflow: ellipsis; white-space: nowrap }
  .revision-change { display: flex; flex: 1 1 0; flex-direction: column; gap: 2px; min-width: 0 }
  .revision-main { display: flex; flex-wrap: wrap; align-items: center; gap: 3px 7px; min-width: 0 }
  .revision-kind { font-weight: 500 }
  .revision-entry { font-weight: 500; overflow-wrap: anywhere }
  .revision-number { color: var(--muted); font-size: 11.5px; white-space: nowrap }
  a.revision-number { text-decoration: underline; text-underline-offset: 3px }
  a.revision-number:hover { color: var(--accent) }
  .revision-comment { overflow: hidden; color: var(--muted); font-size: 12.5px; text-overflow: ellipsis; white-space: nowrap }
  .revision-rev { flex: 0 0 36px; color: var(--muted); font-size: 11.5px; font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap }
  .revision-thank { flex: 0 0 auto; min-width: 44px; font-size: 12px; text-align: right; white-space: nowrap }
  .redact-reason { flex: 0 0 auto }
  .thank { padding: 0; border: 0; background: none; color: var(--muted); font: inherit; cursor: pointer; text-decoration: underline; text-underline-offset: 3px }
  .thank:hover, .thank:focus-visible { color: var(--accent) }
  .thanked { color: var(--muted) }
  .revision-toggle { flex: 0 0 16px; color: var(--muted); font-size: 16px; line-height: 1; text-align: center }
  details .revision-toggle::before { content: '+' }
  details[open] .revision-toggle::before { content: '−' }
  details[open] > .revision-row { background: var(--surface-tile) }
  .revision-body { padding: 18px 16px 20px; border-top: 1px solid var(--line); background: var(--surface-sunken) }
  .revision-links { display: flex; flex-wrap: wrap; gap: 4px 18px; margin-bottom: 14px; font-size: 12.5px; font-weight: 500 }
  .revision-action { display: flex; justify-content: flex-end; margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--line) }
  .revision-action.redact { gap: 8px }
  .revision-action.redact .input { flex: 1 1 auto; width: auto; min-width: 0 }
  .revision-more { display: flex; flex-wrap: wrap; gap: 8px; margin-block: 18px }
  .run-lines { list-style: none; margin: 0; padding: 10px 16px 14px; border-top: 1px solid var(--line); background: var(--surface-sunken); font-size: 12.5px }
  .run-lines li { display: flex; align-items: baseline; gap: 16px; padding: 4px 0 }
  .run-lines time { flex: 0 0 148px; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap }
  .run-change { display: flex; flex: 1 1 0; flex-wrap: wrap; align-items: baseline; gap: 2px 7px; min-width: 0 }
  .run-change .revision-comment { flex: 1 1 100% }
  @media (max-width: 700px) {
    .revision-row { flex-wrap: wrap; gap: 2px 10px; padding: 12px 2px }
    .revision-time { flex: 0 0 auto }
    .revision-actor { flex: 1 1 auto; flex-direction: row; flex-wrap: wrap; align-items: center; gap: 4px 6px; order: 2 }
    .redact-reason { order: 5 }
    .revision-thank { order: 3; margin-left: auto }
    .revision-toggle { order: 3; margin-left: auto }
    .revision-thank ~ .revision-toggle { margin-left: 0 }
    .revision-rev { display: none }
    .revision-change { flex: 1 0 100%; order: 4 }
    .revision-comment { white-space: normal }
    .revision-body { padding: 16px 12px 18px }
    .run-lines { padding-inline: 12px }
    .run-lines li { flex-direction: column; gap: 0 }
    .run-lines time { flex: 0 0 auto }
  }
</style>
