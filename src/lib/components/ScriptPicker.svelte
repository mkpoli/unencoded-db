<script lang="ts" module>
  // The names other records give scripts outside the list, asked for once a page visit.
  let named: Promise<string[]> | null = null
  function customNames() {
    named ??= fetch('/api/scripts').then(response => response.ok ? response.json() : []).then(found => Array.isArray(found) ? found.filter((name): name is string => typeof name === 'string') : [])
    named.catch(() => { named = null })
    return named
  }
</script>

<script lang="ts">
  // The script of a record: a line naming it, which opens onto a field that takes a script of the list or a
  // name of the visitor's own. The list offers the names other records have given too. Nearly every record
  // is Han, so the line stays folded until someone asks for it. The field sends the name, and the server
  // finds the script it names.
  import { untrack } from 'svelte'
  import { catalogues } from '$lib/i18n'
  import { SCRIPTS, SCRIPT_NAME_MAX, resolveScript, scriptName } from '$lib/scripts'
  import { locale, t } from '$lib/t'
  import Combobox, { type ComboOption } from './Combobox.svelte'
  import FactLine from './FactLine.svelte'

  let { value = 'han', other = '' }: { value?: string; other?: string | null } = $props()
  const uid = $props.id()
  const at = locale()
  let text = $state(untrack(() => scriptName(at, value, other)))
  let open = $state(untrack(() => value === 'other' && Boolean(other)))
  let custom = $state<string[]>([])

  const chosen = $derived(resolveScript(text))
  // The name a script gives itself, where the page's language names it otherwise.
  const own = (id: string) => { const name = SCRIPTS.find(script => script.id === id)?.own; return name && name !== t(`script.${id}`) ? name : '' }
  const listed: ComboOption[] = SCRIPTS.map(({ id }) => ({ label: t(`script.${id}`), hint: own(id), terms: [id, ...Object.values(catalogues).map(catalogue => catalogue[`script.${id}`])].join(' '), group: 0 }))
  const options = $derived([...listed, ...custom.filter(name => resolveScript(name).script === 'other').map(name => ({ label: name, group: 1 }))])

  async function more() { custom = await customNames().catch(() => []) }
</script>

<FactLine label={t('field.script')} labelId="{uid}-label" stated bind:open>
  {#snippet value()}{scriptName(at, chosen.script, chosen.script_other)}{#if chosen.script !== 'other' && own(chosen.script)}<span class="own">{own(chosen.script)}</span>{/if}{/snippet}
  <Combobox id="{uid}-script" name="script" bind:value={text} {options} labelledby="{uid}-label" maxlength={SCRIPT_NAME_MAX} onopen={more} />
</FactLine>

<style>
  .own { color: var(--muted); font-size: 12.5px }
</style>
