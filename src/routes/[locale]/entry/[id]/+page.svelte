<script lang="ts">
  import { relationshipLabel } from '$lib/comparison-rows'
  import CropField from '$lib/components/CropField.svelte'
  import { formatDate, localizedHref, t, type Locale } from '$lib/i18n'

  type Comparison = { character: string; relationship: string; differences: string; evidence: string }
  type Genre = { slug: string; label: string }
  type Crop = { id: number; evidence_id: number; x: number; y: number; w: number; h: number }
  type Collection = { slug: string; label: string }
  type Relation = { id: number; to_entry: number | null; to_character: string; kind: string; evidence_id: number; difference: string | null; place: string; year: string | null }
  type Evidence = { id: number; place: string; title: string | null; author: string | null; publisher: string | null; year: string | null; page: string | null; note: string | null; has_image: number; created_at: string }
  type Entry = { id: number; script: string; ids: string | null; description: string | null; place: string; title: string | null; author: string | null; publisher: string | null; year: string | null; page: string | null; note: string | null; created_at: string; has_image: number }
  let { data }: { data: { locale: Locale; entry: Entry; comparisons: Comparison[]; evidence: Evidence[]; crops: Crop[]; genres: Genre[]; collections: Collection[]; relations: Relation[]; isModerator: boolean; reported: boolean } } = $props()
  let entry = $derived(data.entry)
  let comparisons = $derived(data.comparisons)
  let evidence = $derived(data.evidence)
  let genres = $derived(data.genres ?? [])
  let crops = $derived(data.crops ?? [])
  let collections = $derived(data.collections ?? [])
  let relations = $derived(data.relations ?? [])
</script>

<svelte:head><title>{t(data.locale, 'entry.record', { id: entry.id })} · {t(data.locale, 'app.name')}</title></svelte:head>
<div class="entry-page">
  <a class="back-link" href={localizedHref(data.locale)}>← {t(data.locale, 'nav.browse')}</a>
  <header class="entry-header">
    <p class="eyebrow">{t(data.locale, 'entry.record', { id: entry.id })}</p>
    <h1>{entry.ids || entry.script}</h1>
    <p><a href={localizedHref(data.locale, `/entry/${entry.id}/edit`)}>{t(data.locale, 'entry.revise')}</a> · <a href={localizedHref(data.locale, `/entry/${entry.id}/history`)}>{t(data.locale, 'entry.history')}</a></p>
    {#if genres.length}
      <p class="genre-list">{#each genres as genre (genre.slug)}<a class="genre-chip" href={localizedHref(data.locale, `/genre/${genre.slug}`)}>{genre.label}</a>{/each}</p>
    {/if}
    {#if collections.length}
      <p class="genre-list">{#each collections as collection (collection.slug)}<a class="genre-chip" href={localizedHref(data.locale, `/collection/${collection.slug}`)}>{collection.label}</a>{/each}</p>
    {/if}
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
    <div class="entry-row"><dt>{t(data.locale, 'entry.added')}</dt><dd>{formatDate(data.locale, entry.created_at)}</dd></div>
  </dl>
  <section class="evidence-section" aria-labelledby="evidence-heading">
    <h2 class="section-label" id="evidence-heading">{t(data.locale, 'entry.sightings')}</h2>
    <p class="field-help">{t(data.locale, 'entry.addSightingHint')}</p>
    {#each evidence as item (item.id)}
      <article class="evidence-card" id={`evidence-${item.id}`}>
        {#if item.has_image}
          <img src={localizedHref(data.locale, `/entry/${entry.id}/evidence/${item.id}/image`)} alt={item.place || t(data.locale, 'field.sourceImage')} loading="lazy" />
        {/if}
        <h3>{item.place}</h3>
        {#if crops.some(crop => crop.evidence_id === item.id)}
          <div class="crop-list">
            {#each crops.filter(crop => crop.evidence_id === item.id) as crop, n (crop.id)}
              <figure class="crop-thumb">
                <div style={`width:120px;height:${120 * crop.h / crop.w}px`}>
                  <img src={localizedHref(data.locale, `/entry/${entry.id}/evidence/${item.id}/image`)} alt={t(data.locale, 'crop.label', { n: n + 1 })} style={`width:${12000 / crop.w}px;margin-left:-${120 * crop.x / crop.w}px;margin-top:-${120 * crop.y / crop.w}px`} />
                </div>
                <figcaption>{t(data.locale, 'crop.label', { n: n + 1 })}</figcaption>
              </figure>
            {/each}
          </div>
        {/if}
        <dl class="entry-meta">
          {#if item.title}<div class="entry-row"><dt>{t(data.locale, 'field.title')}</dt><dd>{item.title}</dd></div>{/if}
          {#if item.author}<div class="entry-row"><dt>{t(data.locale, 'field.author')}</dt><dd>{item.author}</dd></div>{/if}
          {#if item.publisher}<div class="entry-row"><dt>{t(data.locale, 'field.publisher')}</dt><dd>{item.publisher}</dd></div>{/if}
          {#if item.year}<div class="entry-row"><dt>{t(data.locale, 'field.year')}</dt><dd>{item.year}</dd></div>{/if}
          {#if item.page}<div class="entry-row"><dt>{t(data.locale, 'field.page')}</dt><dd>{item.page}</dd></div>{/if}
          {#if item.note}<div class="entry-row"><dt>{t(data.locale, 'field.note')}</dt><dd>{item.note}</dd></div>{/if}
        </dl>
        {#if item.has_image}
          <details class="details">
            <summary>{t(data.locale, 'crop.add')}</summary>
            <form class="details-body" method="POST" action="?/crop">
              <input type="hidden" name="evidence" value={item.id} />
              <CropField image={localizedHref(data.locale, `/entry/${entry.id}/evidence/${item.id}/image`)} hint={t(data.locale, 'crop.hint')} />
              <button class="secondary" type="submit">{t(data.locale, 'crop.save')}</button>
            </form>
          </details>
        {/if}
      </article>
    {/each}
    <details class="details">
      <summary>{t(data.locale, 'entry.addSighting')}</summary>
      <form class="details-body" method="POST" action="?/evidence" enctype="multipart/form-data">
        <div class="field"><label class="field-label" for="evidence-place">{t(data.locale, 'field.place')}</label><input id="evidence-place" name="place" required maxlength="500" /></div>
        <div class="field"><label class="field-label" for="evidence-image">{t(data.locale, 'field.sourceImage')}</label><input id="evidence-image" name="image" type="file" accept="image/jpeg,image/png,image/webp" /></div>
        <div class="grid-2">
          <div class="field"><label class="field-label" for="evidence-title">{t(data.locale, 'field.title')}</label><input id="evidence-title" name="title" maxlength="300" /></div>
          <div class="field"><label class="field-label" for="evidence-author">{t(data.locale, 'field.author')}</label><input id="evidence-author" name="author" maxlength="300" /></div>
          <div class="field"><label class="field-label" for="evidence-publisher">{t(data.locale, 'field.publisher')}</label><input id="evidence-publisher" name="publisher" maxlength="300" /></div>
          <div class="field"><label class="field-label" for="evidence-year">{t(data.locale, 'field.year')}</label><input id="evidence-year" name="year" maxlength="40" placeholder="1998 / 1998-05 / 1998-05-12 / 05" /></div>
          <div class="field"><label class="field-label" for="evidence-page">{t(data.locale, 'field.page')}</label><input id="evidence-page" name="page" maxlength="80" /></div>
        </div>
        <div class="field"><label class="field-label" for="evidence-note">{t(data.locale, 'field.note')}</label><textarea id="evidence-note" name="note" maxlength="5000"></textarea></div>
        <div class="form-actions"><button class="primary" type="submit">{t(data.locale, 'entry.addSighting')}</button></div>
      </form>
    </details>
  </section>
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
  <section class="related-section" aria-labelledby="relations-heading">
    <h2 class="section-label" id="relations-heading">{t(data.locale, 'relation.title')}</h2>
    <p class="field-help">{t(data.locale, 'relation.intro')}</p>
    {#if relations.length}
      <div class="related-list">
        {#each relations as relation (relation.id)}
          <article class="related-card">
            <h3>{relation.to_character}</h3>
            <dl class="entry-meta">
              <div class="entry-row"><dt>{t(data.locale, 'relation.kind')}</dt><dd>{relationshipLabel(data.locale, relation.kind)}</dd></div>
              <div class="entry-row"><dt>{t(data.locale, 'relation.evidence')}</dt><dd><a class="text-link" href={`#evidence-${relation.evidence_id}`}>{relation.place}{#if relation.year} · {relation.year}{/if}</a></dd></div>
              {#if relation.difference}<div class="entry-row"><dt>{t(data.locale, 'relation.difference')}</dt><dd>{relation.difference}</dd></div>{/if}
            </dl>
          </article>
        {/each}
      </div>
    {:else}
      <p class="field-help">{t(data.locale, 'relation.empty')}</p>
    {/if}
    <details class="details">
      <summary>{t(data.locale, 'relation.add')}</summary>
      <form class="details-body" method="POST" action="?/relation">
        <div class="field"><label class="field-label" for="relation-target">{t(data.locale, 'relation.target')}</label><input id="relation-target" name="target" required maxlength="80" /></div>
        <div class="field"><label class="field-label" for="relation-kind">{t(data.locale, 'relation.kind')}</label><select id="relation-kind" name="kind">{#each ['sound','meaning','glyph','usage','variant','not_variant','similar','uncertain'] as kind}<option value={kind}>{relationshipLabel(data.locale, kind)}</option>{/each}</select></div>
        <div class="field"><label class="field-label" for="relation-evidence">{t(data.locale, 'relation.evidence')}</label><select id="relation-evidence" name="evidence" required>{#each evidence as item}<option value={item.id}>{item.place}{#if item.year} · {item.year}{/if}</option>{/each}</select></div>
        <div class="field"><label class="field-label" for="relation-difference">{t(data.locale, 'relation.difference')}</label><textarea id="relation-difference" name="difference" maxlength="5000"></textarea></div>
        <button class="secondary" type="submit">{t(data.locale, 'relation.save')}</button>
      </form>
    </details>
  </section>
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
