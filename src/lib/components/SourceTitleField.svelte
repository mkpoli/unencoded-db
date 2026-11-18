<script lang="ts">
  import Combobox, { type ComboOption } from './Combobox.svelte'
  import { media, t } from '$lib/t'
  import { recordCode } from '$lib/code'
  import type { SourceMatch } from '$lib/server/source-aliases'
  import type { Source } from '$lib/server/entries'

  let { id, name, value = $bindable(''), onselect }: {
    id: string; name: string; value?: string; onselect: (source: Source) => void
  } = $props()
  let query = $state('')
  let chosenLabel = $state('')
  let matches = $state<SourceMatch[]>([])
  const byKey = $derived(new Map(matches.map(source => [String(source.id), source])))
  type Cursor = [string, number]
  let page = $state<{ cursor: Cursor | null }>({ cursor: null }), next = $state<Cursor | null>(null)
  const options = $derived<ComboOption[]>([...matches.map(source => ({
    key: String(source.id),
    label: source.title || source.url || source.author || source.publisher || source.report_date || `#${source.id}`,
  })), ...(next !== null ? [{ key: 'more', more: true, label: t('browse.more') }] : [])])

  function search(text: string) {
    if (text !== query) { matches = []; page = { cursor: null }; next = null }
    query = text
  }
  $effect(() => {
    if (!query.trim()) return
    const cursor = page.cursor
    const params = new URLSearchParams({ q: query })
    if (cursor) { params.set('after', cursor[0]); params.set('id', String(cursor[1])) }
    const url = '/api/sources?' + params
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(url, { signal: controller.signal })
        if (!response.ok) return
        const data: { rows: SourceMatch[]; next: Cursor | null } = await response.json()
        if (controller.signal.aborted) return
        matches = [...new Map([...(cursor ? matches : []), ...data.rows].map(row => [row.id, row])).values()]
        next = data.next
      } catch { /* Free text is still usable offline. */ }
    }, 120)
    return () => { clearTimeout(timer); controller.abort() }
  })

  function choose(option: ComboOption) {
    const source = byKey.get(option.key ?? '')
    if (source) {
      chosenLabel = source.title ? '' : option.label
      value = source.title ?? ''
      onselect(source)
    }
    search('')
  }
</script>

<div class="field">
  <label for={id} id="{id}-label">{t('field.title')}</label>
  <Combobox {id} {name} {options} filter={false} bind:value labelledby="{id}-label" maxlength={300} placeholder={chosenLabel}
    onopen={() => search(value)} onquery={text => { chosenLabel = ''; search(text) }} onselect={choose} onmore={() => { if (next !== null) page = { cursor: next } }}>
    {#snippet optionContent(option)}
      {@const source = byKey.get(option.key ?? '')}
      {#if source}
        {@const evidence = source.evidence}
        <span class="result">
          {#if evidence?.thumb}<img src={media(evidence.thumb)} width="68" height="76" alt="" loading="lazy" decoding="async" />{/if}
          <span class="description">
            <strong>{option.label}</strong>
            {#if source.alias && source.alias !== option.label}<span>{t('source.alias')} · {source.alias}</span>{/if}
            {#if source.author}<span>{t('field.author')} · {source.author}</span>{/if}
            {#if source.publisher}<span>{t('field.publisher')} · {source.publisher}</span>{/if}
            {#if source.report_date}<span>{t('field.reportDate')} · {source.report_date}</span>{/if}
            {#if source.url && source.title}<span>{source.url}</span>{/if}
            {#if evidence}
              <span class="evidence">{evidence.via ? t('source.foundVia') : t('entry.record', { id: recordCode(evidence.entry) })}{#if evidence.via} · {recordCode(evidence.entry)}{/if}{#if evidence.ids} · {evidence.ids}{/if}{#if !evidence.via && evidence.page} · {t('field.page')} {evidence.page}{/if}{#if !evidence.via && evidence.place && evidence.place !== option.label} · {evidence.place}{/if}</span>
            {/if}
            <span>{t(source.records === 1 ? 'source.record' : 'source.records', { n: source.records })} · #{source.id}</span>
          </span>
        </span>
      {/if}
    {/snippet}
  </Combobox>
</div>

<style>
  .result { display:flex; gap:10px; width:100%; min-width:0; align-items:start }
  img { flex:none; max-width:24%; object-fit:contain; background:var(--surface-sunken); border-radius:4px }
  .description { display:grid; gap:2px; min-width:0; font-size:12px; line-height:1.35; color:var(--muted); overflow-wrap:anywhere }
  strong { color:var(--ink); font-size:14px; line-height:1.3 }
  .evidence { color:var(--ink) }
</style>
