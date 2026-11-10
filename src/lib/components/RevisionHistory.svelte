<script lang="ts">
  import { splitIds } from '$lib/ids'
  import type { RevisionSnapshot } from '$lib/revision'
  import { formatDate, localizedHref, t, type Locale } from '$lib/i18n'

  let { locale, revisions, showEntry = false }: { locale: Locale; revisions: RevisionSnapshot[]; showEntry?: boolean } = $props()

  const stop = (event: MouseEvent) => event.stopPropagation()
</script>

<div class="related-list">
  {#each revisions as revision (`${revision.entry_id}:${revision.revision}`)}
    <details class="related-card revision-card">
      <summary class="revision-summary">
        <span class="revision-heading">
          {#if showEntry}
            <a class="revision-entry" href={localizedHref(locale, `/entry/${revision.entry_id}`)} onclick={stop}>
              {#if revision.tombstone || !revision.ids}{t(locale, 'entry.record', { id: revision.entry_id })}{:else}{splitIds(revision.ids).join(' · ')}{/if}
            </a>
          {/if}
          <span class="revision-number">{t(locale, 'history.revision', { n: revision.revision })}</span>
        </span>
        <time class="revision-date" datetime={revision.recorded_at}>{formatDate(locale, revision.recorded_at)}</time>
      </summary>
      {#if revision.tombstone}
        <p class="notice">{t(locale, 'history.redacted')}</p>
      {:else}
        <dl class="entry-meta">
          <div class="entry-row"><dt>{t(locale, 'field.script')}</dt><dd>{revision.script}</dd></div>
          {#if revision.ids}<div class="entry-row"><dt>{t(locale, 'field.ids')}</dt><dd>{splitIds(revision.ids).join(' · ')}</dd></div>{/if}
          {#if revision.description}<div class="entry-row"><dt>{t(locale, 'field.description')}</dt><dd>{revision.description}</dd></div>{/if}
          <div class="entry-row"><dt>{t(locale, 'field.place')}</dt><dd>{revision.place}</dd></div>
          {#if revision.title}<div class="entry-row"><dt>{t(locale, 'field.title')}</dt><dd>{revision.title}</dd></div>{/if}
          {#if revision.author}<div class="entry-row"><dt>{t(locale, 'field.author')}</dt><dd>{revision.author}</dd></div>{/if}
          {#if revision.publisher}<div class="entry-row"><dt>{t(locale, 'field.publisher')}</dt><dd>{revision.publisher}</dd></div>{/if}
          {#if revision.year}<div class="entry-row"><dt>{t(locale, 'field.year')}</dt><dd>{revision.year}</dd></div>{/if}
          {#if revision.page}<div class="entry-row"><dt>{t(locale, 'field.page')}</dt><dd>{revision.page}</dd></div>{/if}
          {#if revision.note}<div class="entry-row"><dt>{t(locale, 'field.note')}</dt><dd>{revision.note}</dd></div>{/if}
          <div class="entry-row"><dt>{t(locale, 'history.recorded')}</dt><dd>{formatDate(locale, revision.recorded_at)}</dd></div>
        </dl>
      {/if}
    </details>
  {/each}
</div>

<style>
  .revision-summary {
    display: flex; align-items: baseline; justify-content: space-between; gap: 8px 16px; flex-wrap: wrap;
    list-style: none; cursor: pointer;
  }
  .revision-summary::-webkit-details-marker { display: none }
  .revision-summary::after { content: '+'; color: var(--muted); font-size: 16px; line-height: 1 }
  .revision-card[open] .revision-summary::after { content: '−' }
  .revision-heading { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; min-width: 0 }
  .revision-entry { color: var(--ink); font-weight: 550; text-decoration: none; overflow-wrap: anywhere }
  .revision-entry:hover { color: var(--accent); text-decoration: underline; text-underline-offset: 3px }
  .revision-number { color: var(--muted); font-size: var(--text-sm) }
  .revision-card[open] .revision-summary { margin-bottom: var(--space-2) }
</style>
