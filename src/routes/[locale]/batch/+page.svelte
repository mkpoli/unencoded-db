<script lang="ts">
  import { untrack } from 'svelte'
  import Seo from '$lib/components/Seo.svelte'
  import PicturePicker from '$lib/components/PicturePicker.svelte'
  import ScriptPicker from '$lib/components/ScriptPicker.svelte'
  import SightingFields from '$lib/components/SightingFields.svelte'
  import SubmitBar from '$lib/components/SubmitBar.svelte'
  import { BATCH_ROWS_MAX } from '$lib/limits'
  import { href, t } from '$lib/t'
  let { form } = $props()
  const values = $derived(form?.values)
  let busy = $state(0)
  let next = 0
  // Typed rows come back with a rejected batch; pictures are chosen again.
  const row = (ids = '', note = '') => ({ key: next++, ids, note })
  const typed = untrack(() => form?.values?.rows ?? [])
  let rows = $state(typed.length ? typed.map(item => row(item.ids, item.note)) : [row(), row(), row()])
  const message = $derived(form?.error ? `${form.row ? `${t('batch.row', { n: form.row })} · ` : ''}${t(`error.${form.error}`, { max: BATCH_ROWS_MAX, n: form.row ?? 0 })}` : null)
</script>

<Seo title={t('batch.title')} />
<div class="page narrow stack">
  <div class="stack heading"><h1>{t('batch.title')}</h1><p class="muted">{t('batch.intro')}</p></div>
  {#if message}<p class="notice bad" role="alert">{message}</p>{/if}
  <form class="stack" method="POST" enctype="multipart/form-data">
    <section class="panel stack">
      <ScriptPicker value={values?.script} other={values?.script_other} />
      <SightingFields {values} />
    </section>
    <section class="stack"><h2>{t('batch.rows')}</h2>
      {#each rows as item, index (item.key)}
        <fieldset class="panel stack">
          <legend>{t('batch.row', { n: index + 1 })}</legend>
          <div class="field"><label for="ids-{item.key}">{t('field.ids')}</label><input id="ids-{item.key}" class="input ids" name="ids" bind:value={item.ids} maxlength="200" autocomplete="off" spellcheck="false" placeholder="⿰亻⿱七木" /></div>
          <div class="field"><label for="note-{item.key}">{t('field.note')}</label><input id="note-{item.key}" class="input" name="row_note" bind:value={item.note} maxlength="5000" /></div>
          <PicturePicker label="{t('field.image')} {index + 1}" onready={working => busy += working ? 1 : -1} />
          {#if rows.length > 1}<div><button type="button" class="button" onclick={() => rows.splice(index, 1)}>{t('batch.remove')}</button></div>{/if}
        </fieldset>
      {/each}
      {#if rows.length < BATCH_ROWS_MAX}<div><button type="button" class="button" onclick={() => rows.push(row())}>{t('batch.add')}</button></div>{/if}
    </section>
    <SubmitBar busy={busy > 0} label={t('batch.save')} cancel={href()} />
  </form>
</div>
<style>
  .heading { gap:8px } .panel { padding:20px; border:1px solid var(--line); border-radius:10px; background:var(--surface); min-width:0; margin:0 }
  legend { padding:0 6px; font-weight:600 }
  @media(max-width:700px) { .panel { padding:16px } }
</style>
