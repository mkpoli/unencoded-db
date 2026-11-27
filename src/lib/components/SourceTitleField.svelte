<script lang="ts">
  import { untrack } from 'svelte'
  import EvidenceDate from './EvidenceDate.svelte'
  import { westernDate } from '$lib/dates'
  import Combobox, { type ComboOption } from './Combobox.svelte'
  import { media, t } from '$lib/t'
  import { kindName } from '$lib/source-kind'
  import { sourceHeading } from '$lib/source-name'
  import { sourceNameKey, titleReadingKey } from '$lib/name-key'
  import { recordCode } from '$lib/code'
  import type { SourceMatch } from '$lib/server/source-aliases'
  import type { Source } from '$lib/server/entries'

  let { id, name, value = $bindable(''), onselect, onsource }: {
    id: string; name: string; value?: string; onselect: (source: Source) => void; onsource?: (sourceId: number | null) => void
  } = $props()
  let query = $state('')
  let chosenLabel = $state('')
  let matches = $state<SourceMatch[]>([])
  let quietMatches = $state<SourceMatch[]>([])
  let pickedId = $state<number | null>(null)
  const byKey = $derived(new Map(matches.map(source => [String(source.id), source])))
  type Cursor = [string, number]
  let page = $state<{ cursor: Cursor | null }>({ cursor: null }), next = $state<Cursor | null>(null)
  const options = $derived<ComboOption[]>([...matches.map(source => ({
    key: String(source.id),
    label: sourceHeading(source, t),
  })), ...(next !== null ? [{ key: 'more', more: true, label: t('browse.more') }] : [])])

  function matchedSourceId(text: string, list: readonly SourceMatch[]): number | null {
    const typed = sourceNameKey(text)
    if (!typed) return null
    const reading = titleReadingKey(text)
    const exact = list.filter(source =>
      (source.title && sourceNameKey(source.title) === typed)
      || (source.alias && sourceNameKey(source.alias) === typed)
      || (source.reading && sourceNameKey(source.reading) === typed)
      || source.lookup === typed
      || (reading && source.lookup === reading)
      || sourceNameKey(sourceHeading(source, t)) === typed
    )
    // A title several citations share names none of them until one is picked.
    const ids = new Set(exact.map(source => source.id))
    return ids.size === 1 ? exact[0].id : null
  }

  const resolvedSourceId = $derived(pickedId ?? matchedSourceId(value, matches.length ? matches : quietMatches))
  let lastSourceId: number | null = null
  $effect(() => {
    const nextId = resolvedSourceId
    if (nextId === lastSourceId) return
    lastSourceId = nextId
    onsource?.(nextId)
  })

  // A title filled in without the list open, by a saved draft or a pasted link, is looked up quietly.
  $effect(() => {
    const text = value.trim()
    if (!onsource || !text || pickedId !== null || untrack(() => query) === value) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      fetch('/api/sources?' + new URLSearchParams({ q: text }), { signal: controller.signal })
        .then(response => response.ok ? response.json() as Promise<{ rows: SourceMatch[] }> : null)
        .then(data => { if (!controller.signal.aborted) quietMatches = data?.rows ?? [] })
        .catch(() => {})
    }, 300)
    return () => { clearTimeout(timer); controller.abort() }
  })

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
      pickedId = source.id
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
    onopen={() => search(value)} onquery={text => { pickedId = null; quietMatches = []; chosenLabel = ''; search(text) }} onselect={choose} onmore={() => { if (next !== null) page = { cursor: next } }}>
    {#snippet optionContent(option)}
      {@const source = byKey.get(option.key ?? '')}
      {#if source}
        {@const evidence = source.evidence}
        <span class="result">
          {#if evidence?.thumb}<img src={media(evidence.thumb)} width="68" height="76" alt="" loading="lazy" decoding="async" />{/if}
          <span class="description">
            <strong>{option.label}</strong>
            {#if source.reading && source.reading !== option.label}<span>{t('source.titleVariant')} · {source.reading}</span>
            {:else if source.alias && source.alias !== option.label}<span>{t('source.alias')} · {source.alias}</span>{/if}
            {#if source.author}<span>{t('field.author')} · {source.author}</span>{/if}
            {#if source.container && source.title}<span>{t('field.container')} · {source.container}</span>{/if}
            {#if source.source_kind}<span>{kindName(source.source_kind)}</span>{/if}
            {#if source.publisher}<span>{t('field.publisher')} · {source.publisher}</span>{/if}
            {#if source.report_date}<span>{t('field.reportDate')} · <EvidenceDate text={source.report_date} reading={westernDate(source.report_date)} /></span>{/if}
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
