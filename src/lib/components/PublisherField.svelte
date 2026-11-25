<script lang="ts">
  import Combobox, { type ComboOption } from './Combobox.svelte'
  import { PUBLICATION_KINDS, type PublicationKind } from '$lib/scripts'
  import { t } from '$lib/t'

  let { id, name, value = $bindable(''), onpick }: {
    id: string; name: string; value?: string; onpick?: (kind: PublicationKind | null) => void
  } = $props()
  type Row = { label: string; aliases: string[]; publicationKind: PublicationKind | null }
  let rows = $state<Row[]>([])
  let query = $state<string | null>(null)
  const group = (kind: PublicationKind | null) => kind ? PUBLICATION_KINDS.indexOf(kind) : PUBLICATION_KINDS.length
  const groupLabel = (kind: PublicationKind | null) => t(kind ? `publicationKind.${kind}` : 'publicationKind.unspecified')
  // A publisher sits under the kind of publication its visible sources mostly name.
  const options = $derived<ComboOption[]>([...rows]
    .sort((a, b) => group(a.publicationKind) - group(b.publicationKind) || a.label.localeCompare(b.label))
    .map(row => ({ label: row.label, terms: row.aliases.join(' '), group: group(row.publicationKind), groupLabel: groupLabel(row.publicationKind) })))
  const byLabel = $derived(new Map(rows.map(row => [row.label, row.publicationKind])))

  $effect(() => {
    if (query === null) return
    const url = '/api/publishers?' + new URLSearchParams({ q: query })
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(url, { signal: controller.signal })
        if (!response.ok) return
        const found: Row[] = await response.json()
        if (!controller.signal.aborted) rows = found
      } catch { /* The editor can still accept the typed name. */ }
    }, query ? 120 : 0)
    return () => { clearTimeout(timer); controller.abort() }
  })
</script>

<div class="field">
  <label id="{id}-label" for={id}>{t('field.publisher')}</label>
  <Combobox {id} {name} bind:value {options} labelledby="{id}-label" maxlength={300} onopen={() => query = value} onquery={text => query = text}
    onchange={() => query = null} onselect={option => onpick?.(byLabel.get(option.label) ?? null)} />
</div>
