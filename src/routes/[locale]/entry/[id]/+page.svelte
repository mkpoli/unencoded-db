<script lang="ts">
  import { relationshipLabel } from '$lib/comparison-rows'
  import { formatDate, localizedHref, t, type Locale } from '$lib/i18n'

  type Comparison = { character: string; relationship: string; differences: string; evidence: string }
  type Entry = { id: number; script: string; ids: string | null; description: string | null; place: string; title: string | null; author: string | null; publisher: string | null; year: string | null; page: string | null; note: string | null; created_at: string; has_image: number }
  let { data }: { data: { locale: Locale; entry: Entry; comparisons: Comparison[]; isModerator: boolean; reported: boolean } } = $props()
  let entry = $derived(data.entry)
  let comparisons = $derived(data.comparisons)
</script>

<svelte:head><title>{t(data.locale, 'entry.record', { id: entry.id })} · {t(data.locale, 'app.name')}</title></svelte:head>
<div class="entry-page">
  <a class="back-link" href={localizedHref(data.locale)}>← {t(data.locale, 'nav.browse')}</a>
  <header class="entry-header">
    <p class="eyebrow">{t(data.locale, 'entry.record', { id: entry.id })}</p>
    <h1>{entry.ids || entry.script}</h1>
  </header>
  {#if data.reported}<p class="notice" role="status">{t(data.locale, 'report.received')}</p>{/if}
  {#if data.isModerator}
    <div class="moderation-bar">
      <span>{t(data.locale, 'moderate.view')}</span>
      <form method="POST" action={localizedHref(data.locale, `/moderate/${entry.id}/hide`)}>
        <button class="secondary" type="submit">{t(data.locale, 'moderate.hide')}</button>
      </form>
    </div>
  {/if}
  {#if entry.has_image}
    <figure class="entry-figure">
      <img src={localizedHref(data.locale, `/entry/${entry.id}/image`)} alt={entry.description || t(data.locale, 'field.sourceImage')} />
    </figure>
  {/if}
  <dl class="entry-meta">
    <div class="entry-row"><dt>{t(data.locale, 'field.script')}</dt><dd>{entry.script}</dd></div>
    {#if entry.ids}<div class="entry-row"><dt>{t(data.locale, 'field.ids')}</dt><dd>{entry.ids}</dd></div>{/if}
    {#if entry.description}<div class="entry-row"><dt>{t(data.locale, 'field.description')}</dt><dd>{entry.description}</dd></div>{/if}
    <div class="entry-row"><dt>{t(data.locale, 'field.place')}</dt><dd>{entry.place}</dd></div>
    {#if entry.title}<div class="entry-row"><dt>{t(data.locale, 'field.title')}</dt><dd>{entry.title}</dd></div>{/if}
    {#if entry.author}<div class="entry-row"><dt>{t(data.locale, 'field.author')}</dt><dd>{entry.author}</dd></div>{/if}
    {#if entry.publisher}<div class="entry-row"><dt>{t(data.locale, 'field.publisher')}</dt><dd>{entry.publisher}</dd></div>{/if}
    {#if entry.year}<div class="entry-row"><dt>{t(data.locale, 'field.year')}</dt><dd>{entry.year}</dd></div>{/if}
    {#if entry.page}<div class="entry-row"><dt>{t(data.locale, 'field.page')}</dt><dd>{entry.page}</dd></div>{/if}
    {#if entry.note}<div class="entry-row"><dt>{t(data.locale, 'field.note')}</dt><dd>{entry.note}</dd></div>{/if}
    <div class="entry-row"><dt>{t(data.locale, 'entry.added')}</dt><dd>{formatDate(data.locale, entry.created_at)}</dd></div>
  </dl>
  {#if comparisons.length}
    <section class="related-section" aria-labelledby="related-heading">
      <h2 class="section-label" id="related-heading">{t(data.locale, 'form.related')}</h2>
      <div class="related-list">
        {#each comparisons as comparison}
          <article class="related-card">
            <h3>{comparison.character}</h3>
            <dl class="entry-meta">
              <div class="entry-row"><dt>{t(data.locale, 'field.relationship')}</dt><dd>{relationshipLabel(data.locale, comparison.relationship)}</dd></div>
              {#if comparison.differences}<div class="entry-row"><dt>{t(data.locale, 'field.differences')}</dt><dd>{comparison.differences}</dd></div>{/if}
              {#if comparison.evidence}<div class="entry-row"><dt>{t(data.locale, 'field.comparisonEvidence')}</dt><dd>{comparison.evidence}</dd></div>{/if}
            </dl>
          </article>
        {/each}
      </div>
    </section>
  {/if}
  <details class="details">
    <summary>{t(data.locale, 'report.summary')}</summary>
    <form class="details-body" method="POST" action={localizedHref(data.locale, `/entry/${entry.id}/report`)}>
      <div class="field">
        <label class="field-label" for="report-reason">{t(data.locale, 'report.reason')}</label>
        <select id="report-reason" name="reason" required>
          <option value="spam">{t(data.locale, 'report.reason.spam')}</option>
          <option value="privacy">{t(data.locale, 'report.reason.privacy')}</option>
          <option value="rights">{t(data.locale, 'report.reason.rights')}</option>
          <option value="other">{t(data.locale, 'report.reason.other')}</option>
        </select>
      </div>
      <div class="field">
        <label class="field-label" for="report-note">{t(data.locale, 'report.note')} <span class="field-help">{t(data.locale, 'form.optional')}</span></label>
        <textarea id="report-note" name="note" maxlength="2000" rows="4"></textarea>
      </div>
      <p class="field-help">{t(data.locale, 'report.hint')}</p>
      <div class="form-actions">
        <button class="primary" type="submit">{t(data.locale, 'report.send')}</button>
      </div>
    </form>
  </details>
</div>
