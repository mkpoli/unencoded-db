<script lang="ts">
  import Combobox, { type ComboOption } from './Combobox.svelte'
  import { t } from '$lib/t'
  import type { Source } from '$lib/server/entries'

  let { id, name, value = $bindable(''), onselect }: {
    id: string; name: string; value?: string; onselect: (source: Source) => void
  } = $props()
  let query = $state('')
  type Match = Source & { alias: string | null }
  let matches = $state<Match[]>([])
  type Cursor = [string, number]
  let page = $state<{ cursor: Cursor | null }>({ cursor: null }), next = $state<Cursor | null>(null)
  const options = $derived<ComboOption[]>([...matches.map(source => ({
    key: String(source.id),
    label: source.title || source.url || source.author || source.publisher || source.report_date || `#${source.id}`,
    hint: [source.alias, source.author, source.publisher, source.report_date, `#${source.id}`].filter(Boolean).join(' · '),
    terms: source.alias ?? '',
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
        const data: { rows: Match[]; next: Cursor | null } = await response.json()
        if (controller.signal.aborted) return
        matches = [...new Map([...(cursor ? matches : []), ...data.rows].map(row => [row.id, row])).values()]
        next = data.next
      } catch { /* Free text is still usable offline. */ }
    }, 120)
    return () => { clearTimeout(timer); controller.abort() }
  })

  function choose(option: ComboOption) {
    const source = matches.find(row => String(row.id) === option.key)
    if (source) {
      value = source.title ?? ''
      onselect(source)
    }
    search('')
  }
</script>

<div class="field">
  <label for={id} id="{id}-label">{t('field.title')}</label>
  <Combobox {id} {name} {options} bind:value labelledby="{id}-label" maxlength={300}
    onopen={() => search(value)} onquery={search} onselect={choose} onmore={() => { if (next !== null) page = { cursor: next } }} />
</div>
