<script lang="ts">
  // A description of the character: typed or pasted, or built in the IDS editor. While it holds one, it says
  // whether an encoded character or another record has the same description.
  import { codePoints, cleanIds, workshopUrl } from '$lib/ids'
  import { encodedMatch } from '$lib/encoded'
  import { lookupIdsHints } from '$lib/ids-hints'
  import { href, locale, t } from '$lib/t'
  import { browser } from '$app/environment'

  let { value = $bindable('') }: { value?: string } = $props()
  let dialog = $state<HTMLDialogElement>()
  let Editor = $state<typeof import('./IdsEditor.svelte').default | null>(null)
  let draft = $state('')
  let encoded = $state<string | null>(null)
  let same = $state<{ id: number }[]>([])

  async function open() {
    draft = value
    dialog?.showModal()
    Editor ??= (await import('./IdsEditor.svelte')).default
  }
  function use(sequence: string) { value = sequence; dialog?.close() }

  $effect(() => {
    const ids = cleanIds(value)
    encoded = null; same = []
    if (!browser || [...ids].length < 2) return
    let cancel = () => {}
    const timer = setTimeout(() => {
      cancel = lookupIdsHints(ids, encodedMatch, found => { encoded = found }, records => { same = records })
    }, 350)
    return () => { cancel(); clearTimeout(timer) }
  })
</script>

<div class="field">
  <label for="ids">{t('field.ids')}</label>
  <div class="row">
    <input id="ids" class="input ids grow" name="ids" bind:value autocomplete="off" spellcheck="false" placeholder="⿰亻⿱七木" />
    <button type="button" class="button" onclick={open}>{t('field.idsBuild')}</button>
  </div>
  <p class="hint">{t('field.idsHint')} <a class="text-link" href={workshopUrl(cleanIds(value))} target="_blank" rel="noopener">{t('field.idsWorkshop')} ↗</a></p>
  {#if encoded}<p class="notice quiet small" data-testid="encoded-hint">{t('field.idsEncoded', { char: encoded, code: codePoints(encoded) })}</p>{/if}
  {#if same.length}<p class="notice quiet small">{t('field.idsSame')} {#each same as record, i}{i ? ', ' : ''}<a class="text-link" href={href(`/entry/${record.id}`)} target="_blank">#{record.id}</a>{/each}</p>{/if}
</div>

<dialog bind:this={dialog} class="ids-dialog" aria-label={t('field.idsBuild')}>
  <div class="ids-dialog-body">
    {#if Editor}<Editor bind:value={draft} locale={locale()} onuse={use} />{:else}<p class="muted">{t('field.idsLoading')}</p>{/if}
  </div>
  <div class="row ids-dialog-foot">
    <button type="button" class="button primary" disabled={!draft} onclick={() => use(draft)}>{t('field.idsUse')}</button>
    <button type="button" class="button" onclick={() => dialog?.close()}>{t('field.idsClose')}</button>
  </div>
</dialog>

<style>
  .grow { flex: 1 1 220px; width: auto }
  .ids-dialog { width: min(980px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); overflow: hidden }
  .ids-dialog[open] { display: flex; flex-direction: column }
  .ids-dialog-body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 16px }
  .ids-dialog-foot { flex: none; justify-content: flex-end; padding: 12px 16px; border-top: 1px solid var(--line) }
</style>
