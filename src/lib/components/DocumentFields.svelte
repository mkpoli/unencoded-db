<script lang="ts">
  // Unicode, IRG and WG2 documents that discuss this character. Each row sends its document number,
  // optional page and optional direct link in parallel form fields.
  import { untrack } from 'svelte'
  import { CLAIM_LIMITS } from '$lib/claims'
  import { DOCUMENT_NUMBER_MAX, DOCUMENT_PAGE_MAX, DOCUMENT_URL_MAX, formatDocument, normalizeDocumentNumber, type UnicodeDocument } from '$lib/unicode-docs'
  import { t } from '$lib/t'

  type Row = { doc: string; page: string; url: string }
  let { values = [], stated = $bindable([]) }: { values?: UnicodeDocument[]; stated?: string[] } = $props()

  const uid = $props.id()
  const row = (item: UnicodeDocument): Row => ({ doc: item.doc, page: item.page ?? '', url: item.url ?? '' })
  let rows = $state<Row[]>(untrack(() => values.length ? values.map(row) : [{ doc: '', page: '', url: '' }]))

  $effect.pre(() => {
    stated = rows
      .filter(item => item.doc.trim())
      .map(item => formatDocument(normalizeDocumentNumber(item.doc), item.page.trim() || null))
  })
</script>

<div class="group" role="group" aria-label={t('field.documents')}>
  <input type="hidden" name="documents_present" value="1" />
  {#if rows.length}
    <div class="head" aria-hidden="true">
      <span>{t('field.documentNumber')}</span>
      <span>{t('field.documentPage')}</span>
      <span>{t('field.documentUrl')}</span>
      <span></span>
    </div>
  {/if}
  {#each rows as item, index}
    <div class="document">
      <input
        id="{uid}-doc-{index}"
        class="input mono"
        name="document_number"
        maxlength={DOCUMENT_NUMBER_MAX}
        bind:value={item.doc}
        placeholder="L2/25-056, IRG N2850"
        aria-label="{t('field.documentNumber')} {index + 1}"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="none"
        spellcheck="false"
      />
      <input
        id="{uid}-page-{index}"
        class="input"
        name="document_page"
        maxlength={DOCUMENT_PAGE_MAX}
        bind:value={item.page}
        placeholder="12"
        aria-label="{t('field.documentPage')} {index + 1}"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="none"
        spellcheck="false"
      />
      <input
        id="{uid}-url-{index}"
        class="input mono"
        name="document_url"
        type="url"
        maxlength={DOCUMENT_URL_MAX}
        bind:value={item.url}
        placeholder="https://…"
        aria-label="{t('field.documentUrl')} {index + 1}"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="none"
        spellcheck="false"
      />
      {#if rows.length > 1 || item.doc || item.page || item.url}
        <button
          class="remove"
          type="button"
          aria-label="{t('field.documentRemove')} {index + 1}"
          title={t('field.documentRemove')}
          onclick={() => rows.splice(index, 1)}
        ><span aria-hidden="true">×</span></button>
      {/if}
    </div>
  {/each}
  {#if rows.length < CLAIM_LIMITS.document.max}
    <button class="text-button" type="button" onclick={() => rows.push({ doc: '', page: '', url: '' })}>+ {t('field.documentAdd')}</button>
  {/if}
</div>

<style>
  .group { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; min-width: 0 }
  .head, .document { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.6fr) minmax(0, 1.3fr) 28px; align-items: start; gap: 8px; width: 100% }
  .head { font-weight: 500 }
  .remove { width: 28px; height: 42px; padding: 0; border: 0; background: none; color: var(--muted); font-size: 18px; line-height: 1; cursor: pointer }
  .remove:hover { color: var(--wrong) }
  @media (max-width: 600px) {
    .head { display: none }
    .document { grid-template-columns: minmax(0, 1fr) 28px }
    .document > input:nth-child(2), .document > input:nth-child(3) { grid-column: 1 }
    .remove { grid-column: 2; grid-row: 1 }
  }
</style>
