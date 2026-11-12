<script lang="ts">
  // The descriptions of the character, separated by commas: typed or pasted, or built in the IDS editor.
  // The editor works on the first one, which draws the glyph. While the first is complete, the field says
  // whether an encoded character or another record has the same description. A lone encoded character is
  // replaced by its description, and `onfill` receives what is known of it.
  import { codePoints, IDS_FIELD_MAX, splitIds, workshopUrl } from '$lib/ids'
  import { characterFacts, encodedMatch, type CharacterFacts } from '$lib/encoded'
  import { href, locale, t } from '$lib/t'
  import { browser } from '$app/environment'

  let { value = $bindable(''), onfill }: { value?: string; onfill?: (facts: CharacterFacts) => void } = $props()
  let dialog = $state<HTMLDialogElement>()
  let Editor = $state<typeof import('./IdsEditor.svelte').default | null>(null)
  let draft = $state('')
  let encoded = $state<string | null>(null)
  let same = $state<{ id: number }[]>([])
  const primary = $derived(splitIds(value)[0] ?? '')

  async function open() {
    draft = primary
    dialog?.showModal()
    Editor ??= (await import('./IdsEditor.svelte')).default
  }
  function use(sequence: string) {
    value = [sequence, ...splitIds(value).slice(1)].filter(Boolean).join(', ')
    dialog?.close()
  }

  $effect(() => {
    const ids = primary
    encoded = null; same = []
    if (!browser || !ids) return
    let live = true
    if ([...ids].length === 1) {
      const timer = setTimeout(async () => {
        const facts = await characterFacts(ids).catch(() => null)
        if (!live || !facts) return
        if (facts.ids) value = [facts.ids, ...splitIds(value).slice(1)].join(', ')
        onfill?.(facts)
      }, 500)
      return () => { live = false; clearTimeout(timer) }
    }
    const timer = setTimeout(async () => {
      const found = await encodedMatch(ids).catch(() => null)
      if (live) encoded = found
      const answer = await fetch(`/api/match?ids=${encodeURIComponent(ids)}`).then(r => r.ok ? r.json() : []).catch(() => [])
      if (live && Array.isArray(answer)) same = answer.filter((item): item is { id: number } => typeof item?.id === 'number')
    }, 350)
    return () => { live = false; clearTimeout(timer) }
  })
</script>

<div class="field">
  <label for="ids">{t('field.ids')}</label>
  <div class="row">
    <input id="ids" class="input ids grow" name="ids" bind:value maxlength={IDS_FIELD_MAX} autocomplete="off" spellcheck="false" placeholder="⿰亻⿱七木" />
    <button type="button" class="button" onclick={open}>{t('field.idsBuild')}</button>
  </div>
  <p class="hint">{t('field.idsHint')} <a class="text-link" href={workshopUrl(primary)} target="_blank" rel="noopener">{t('field.idsWorkshop')} ↗</a></p>
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
