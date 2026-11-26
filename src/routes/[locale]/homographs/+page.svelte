<script lang="ts">
  import IdsGlyph from '$lib/components/IdsGlyph.svelte'
  import Seo from '$lib/components/Seo.svelte'
  import { doculectName } from '$lib/claim-label'
  import { recordCode } from '$lib/code'
  import { scriptName } from '$lib/scripts'
  import { href, locale, media, t } from '$lib/t'
  import type { HomographSighting } from '$lib/server/homographs'
  let { data } = $props()

  const cssString = (text: string) => JSON.stringify(text)
  const citationSummary = (sighting: HomographSighting) => {
    const head = sighting.title ?? sighting.place ?? sighting.url ?? ''
    const parts = [head, sighting.author, sighting.original_date ?? sighting.report_date, sighting.page].filter(Boolean)
    return parts.join(' · ')
  }
</script>

<Seo title={t('homographs.title')} />
<div class="page stack">
  <h1 id="homographs-heading">{t('homographs.title')}</h1>
  {#if data.groups.length}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div tabindex="0" role="region" aria-labelledby="homographs-heading" class="table-wrapper">
      <table
        class="homographs"
        style:--label-record={cssString(t('homographs.column.record'))}
        style:--label-reading={cssString(t('homographs.column.reading'))}
        style:--label-meaning={cssString(t('homographs.column.meaning'))}
        style:--label-evidence={cssString(t('homographs.column.evidence'))}
      >
        <thead>
          <tr>
            <th scope="col" class="col-form">{t('homographs.column.form')}</th>
            <th scope="col" class="col-record">{t('homographs.column.record')}</th>
            <th scope="col" class="col-reading">{t('homographs.column.reading')}</th>
            <th scope="col" class="col-meaning">{t('homographs.column.meaning')}</th>
            <th scope="col" class="col-evidence">{t('homographs.column.evidence')}</th>
          </tr>
        </thead>
        {#each data.groups as group (group.key)}
          {@const showCounterpart = Boolean(group.encoded && !group.encoded.hasRecord && group.records.length === 1)}
          {@const rowCount = group.records.length + (showCounterpart ? 1 : 0)}
          <tbody class="group">
            {#each group.records as record, index (record.id)}
              <tr class:first={index === 0}>
                {#if index === 0}
                  <th scope="rowgroup" rowspan={rowCount} class="form-cell">
                    <div class="form-head">
                      {#if group.encoded}
                        <span class="form-char">{group.encoded.char}</span>
                        <span class="form-code mono">{group.encoded.codePoint}</span>
                        {#if group.formIds}<span class="form-ids muted">{group.formIds}</span>{/if}
                      {:else if group.formIds}
                        <span class="form-plate">
                          <IdsGlyph ids={group.formIds} layout={group.formLayout} path={group.formGlyphId ? data.glyphs?.[group.formGlyphId] : null} />
                        </span>
                        <span class="form-ids">{group.formIds}</span>
                      {:else if group.formCover}
                        <span class="form-plate"><img src={media(group.formCover)} alt="" loading="lazy" decoding="async" /></span>
                      {:else}
                        <span class="muted">—</span>
                      {/if}
                      {#if group.totalRecords > group.records.length}
                        <a class="badge more-records" href={href(`/?filter=homograph${group.encoded ? `&q=${encodeURIComponent(group.encoded.char)}` : group.formIds ? `&q=${encodeURIComponent(group.formIds)}` : ''}`)}>{t('homographs.more', { n: group.totalRecords - group.records.length })}</a>
                      {/if}
                    </div>
                  </th>
                {/if}
                <td class="cell-record">
                  <div class="record-meta">
                    <a class="code" href={href(`/entry/${record.id}`)}>{recordCode(record.id)}</a>
                    <span class="badge">{scriptName(locale(), record.script, record.script_other)}</span>
                    {#each record.unicodeCodes as code (code)}
                      <span class="badge encoded mono">{code}</span>
                    {/each}
                  </div>
                  {#if record.doculects.length}
                    <div class="doculects muted">{record.doculects.map(doculectName).join(' · ')}</div>
                  {/if}
                </td>
                <td class="cell-reading">
                  {#if record.readings.length}
                    <ul class="items">
                      {#each record.readings as reading, ri (`${reading.doculect ?? ''}:${reading.value}:${ri}`)}
                        <li>
                          {#if reading.doculect}<span class="doculect">{doculectName(reading.doculect)}</span>{/if}
                          <span>{reading.value}</span>
                        </li>
                      {/each}
                    </ul>
                  {:else}
                    <span class="muted">—</span>
                  {/if}
                </td>
                <td class="cell-meaning">
                  {#if record.meanings.length}
                    <ul class="items">
                      {#each record.meanings as meaning, mi (`${meaning}:${mi}`)}
                        <li>{meaning}</li>
                      {/each}
                    </ul>
                  {:else}
                    <span class="muted">—</span>
                  {/if}
                </td>
                <td class="cell-evidence">
                  {#if record.sightings.length}
                    <ul class="evidence-list">
                      {#each record.sightings as sighting (sighting.id)}
                        <li class="evidence-item">
                          {#if sighting.thumb_key}
                            <a class="thumb" href={href(`/entry/${record.id}`)} aria-label={t('entry.record', { id: recordCode(record.id) })}>
                              <img src={media(sighting.thumb_key)} alt="" loading="lazy" decoding="async" />
                            </a>
                          {/if}
                          <span class="citation">{citationSummary(sighting)}</span>
                        </li>
                      {/each}
                    </ul>
                    <div class="sighting-count count">{t(record.sightingCount === 1 ? 'browse.sighting' : 'browse.sightings', { n: record.sightingCount })}</div>
                  {:else if record.sightingCount > 0}
                    <span class="count">{t(record.sightingCount === 1 ? 'browse.sighting' : 'browse.sightings', { n: record.sightingCount })}</span>
                  {:else}
                    <span class="muted">—</span>
                  {/if}
                </td>
              </tr>
            {/each}
            {#if showCounterpart && group.encoded}
              <tr class="counterpart-row">
                <td class="cell-record">
                  <div class="record-meta">
                    <span class="counterpart-char">{group.encoded.char}</span>
                    <span class="badge encoded mono">{group.encoded.codePoint}</span>
                    <span class="badge">{t('homographs.encodedCounterpart')}</span>
                  </div>
                </td>
                <td class="cell-reading"><span class="muted">—</span></td>
                <td class="cell-meaning"><span class="muted">—</span></td>
                <td class="cell-evidence"><span class="muted">—</span></td>
              </tr>
            {/if}
          </tbody>
        {/each}
      </table>
    </div>
  {:else if data.next === null}
    <p class="empty muted">{t('homographs.empty')}</p>
  {/if}
  {#if data.next !== null}<a class="button more" href="?after={data.next}">{t('browse.more')}</a>{/if}
</div>

<style>
  .table-wrapper {
    container-type: inline-size;
    overflow: auto;
    max-inline-size: 100%;
    max-block-size: min(78dvb, 920px);
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
    scrollbar-width: thin;
    scrollbar-color: var(--line-strong) transparent;
  }
  @supports not (scrollbar-color: auto) {
    .table-wrapper::-webkit-scrollbar { height: 8px; width: 8px }
    .table-wrapper::-webkit-scrollbar-thumb { background: var(--line-strong); border-radius: 4px }
    .table-wrapper::-webkit-scrollbar-track { background: transparent }
  }
  .homographs {
    inline-size: 100%;
    border-collapse: separate;
    border-spacing: 0;
    font-size: 14px;
    line-height: 1.45;
  }
  thead {
    position: sticky;
    inset-block-start: 0;
    z-index: 2;
  }
  thead th {
    padding: 10px 14px;
    border-bottom: 1px solid var(--line-strong);
    background: var(--surface-sunken);
    color: var(--muted);
    font-size: 12.5px;
    font-weight: 500;
    text-align: start;
    white-space: nowrap;
  }
  .col-form { inline-size: 112px }
  .col-record { min-inline-size: 170px }
  .col-reading { min-inline-size: 150px }
  .col-meaning { min-inline-size: 180px }
  .col-evidence { min-inline-size: 240px }

  tbody th.form-cell {
    position: sticky;
    inset-inline-start: 0;
    z-index: 1;
    padding: 14px 12px;
    border-inline-end: 1px solid var(--line);
    background: var(--surface);
    font-weight: 400;
    text-align: start;
    vertical-align: top;
  }
  tbody td {
    padding: 12px 14px;
    border-top: 1px solid var(--line);
    vertical-align: top;
  }
  tbody tr.first td { border-top: 0 }
  tbody + tbody th.form-cell,
  tbody + tbody tr.first td { border-top: 2px solid var(--line-strong) }

  .form-head { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center }
  .form-char { font-size: 34px; line-height: 1.15; color: var(--ink) }
  .form-code { font-size: 11.5px; color: var(--muted) }
  .form-ids { font-size: 12px; overflow-wrap: anywhere }
  .form-plate {
    display: grid;
    place-items: center;
    inline-size: 52px;
    block-size: 52px;
    overflow: hidden;
    border-radius: 6px;
    background: var(--surface-tile);
    color: var(--ink);
  }
  .form-plate img { inline-size: 100%; block-size: 100%; object-fit: contain }
  .form-plate :global(.sequence) { font-size: 11px; padding: 2px }

  .record-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px }
  .code { font-weight: 500; font-variant-numeric: tabular-nums }
  .code:hover { color: var(--accent); text-decoration: underline; text-underline-offset: 3px }
  .counterpart-char { font-size: 18px; line-height: 1.2 }
  .doculects { margin-top: 4px; font-size: 12.5px }

  .items { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; list-style: none }
  .doculect { margin-inline-end: 6px; color: var(--muted); font-size: 12.5px }

  .evidence-list { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none }
  .evidence-item { display: flex; align-items: flex-start; gap: 8px; min-width: 0 }
  .thumb {
    flex: none;
    display: grid;
    place-items: center;
    inline-size: 36px;
    block-size: 36px;
    overflow: hidden;
    border-radius: 4px;
    background: var(--surface-tile);
  }
  .thumb img { inline-size: 100%; block-size: 100%; object-fit: contain }
  .citation { min-width: 0; font-size: 13px; overflow-wrap: anywhere }
  .sighting-count { margin-top: 6px }

  .empty { padding: 48px 16px; text-align: center }
  .more { align-self: start }

  @container (width < 700px) {
    .homographs, thead, tbody, tr, th, td { display: block }
    thead { display: none }
    .homographs { inline-size: 100% }
    tbody.group { border-bottom: 2px solid var(--line-strong) }
    tbody.group:last-child { border-bottom: 0 }
    tbody + tbody th.form-cell,
    tbody + tbody tr.first td { border-top: 0 }
    tbody th.form-cell {
      position: sticky;
      inset-block-start: 0;
      inset-inline-start: auto;
      z-index: 2;
      padding: 10px 14px;
      border-inline-end: 0;
      border-bottom: 1px solid var(--line);
      background: var(--surface-sunken);
    }
    .form-head { flex-direction: row; justify-content: flex-start; gap: 10px; text-align: start }
    .form-char { font-size: 26px }
    .form-plate { inline-size: 40px; block-size: 40px }
    tbody tr { padding: 10px 14px; border-top: 1px solid var(--line) }
    tbody tr.first { border-top: 0 }
    tbody td { padding: 5px 0; border-top: 0 }
    td.cell-record::before { content: var(--label-record) ": " }
    td.cell-reading::before { content: var(--label-reading) ": " }
    td.cell-meaning::before { content: var(--label-meaning) ": " }
    td.cell-evidence::before { content: var(--label-evidence) ": " }
    tbody td::before {
      display: block;
      margin-bottom: 2px;
      color: var(--muted);
      font-size: 11.5px;
      font-weight: 500;
    }
  }
</style>
