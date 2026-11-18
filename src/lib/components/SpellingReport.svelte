<script lang="ts">
  // A link beside the style plates that opens a dialog for reporting a badly composed glyph. The report goes
  // to the intake with a picture of the drawing the reader chose.
  import { page } from '$app/state'
  import { GLYPH_STYLE, GLYPH_STYLES, type GlyphStyle } from '$lib/composer'
  import { plateImage, sendSpelling, spellingForm, type Sent } from '$lib/spelling-report'
  import { locale, t } from '$lib/t'
  import RadioPill from './RadioPill.svelte'

  let { record, sequence, layout, drawing }: { record: number; sequence: string; layout: string | null; drawing: (style: GlyphStyle) => SVGSVGElement | null } = $props()
  const uid = $props.id()
  let dialog = $state<HTMLDialogElement>()
  let style = $state<GlyphStyle>(GLYPH_STYLE)
  let symptom = $state('')
  let contact = $state('')
  let sending = $state(false)
  let result = $state<Sent | null>(null)

  function open() {
    style = page.data.glyphStyle ?? GLYPH_STYLE
    result = null
    dialog?.showModal()
  }

  async function send(event: SubmitEvent) {
    event.preventDefault()
    if (sending) return
    sending = true
    result = null
    const image = await plateImage(drawing(style))
    result = await sendSpelling(spellingForm({ symptom: symptom.trim(), contact: contact.trim(), sequence, link: page.url.origin + page.url.pathname, style, layout, locale: locale(), record, image }))
    if (result.ok) { symptom = ''; contact = '' }
    sending = false
  }
</script>

<button class="text-link small report" type="button" onclick={open}>{t('spelling.report')}</button>

<dialog bind:this={dialog} aria-labelledby="{uid}-title" onclose={() => result = null}>
  <form class="stack" onsubmit={send}>
    <h2 id="{uid}-title">{t('spelling.report')}</h2>
    {#if result?.ok}
      <p role="status"><a class="text-link" href={result.url} target="_blank" rel="noopener">{t('spelling.issue', { number: result.number })} ↗</a></p>
      <div class="row end"><button class="button" type="button" onclick={() => dialog?.close()}>{t('spelling.close')}</button></div>
    {:else}
      <fieldset>
        <legend>{t('spelling.style')}</legend>
        <div class="pills">{#each GLYPH_STYLES as option (option)}<RadioPill name="{uid}-style" value={option} label={t(`glyphStyle.${option}`)} checked={style === option} onchange={() => style = option} />{/each}</div>
      </fieldset>
      <div class="field"><label for="{uid}-symptom">{t('spelling.symptom')}</label><textarea id="{uid}-symptom" class="input" rows="4" maxlength="4000" required bind:value={symptom}></textarea></div>
      <div class="field"><label for="{uid}-contact">{t('spelling.contact')}</label><input id="{uid}-contact" class="input" maxlength="200" bind:value={contact} /></div>
      {#if result}<p class="notice bad" role="alert">{result.message ?? t('spelling.failed')}</p>{/if}
      <div class="row end">
        <button class="button" type="button" onclick={() => dialog?.close()}>{t('form.cancel')}</button>
        <button class="button primary" type="submit" disabled={sending}>{sending ? t('spelling.sending') : t('spelling.send')}</button>
      </div>
    {/if}
  </form>
</dialog>

<style>
  .report { padding: 0; border: 0; background: none; cursor: pointer; color: var(--muted) }
  dialog { inline-size: min(30rem, calc(100% - 2rem)); max-height: calc(100dvh - 32px); padding: 20px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--ink) }
  dialog::backdrop { background: var(--backdrop) }
  h2 { font-size: 16px; font-weight: 600 }
  fieldset { min-width: 0; margin: 0; padding: 0; border: 0 }
  legend { margin-bottom: 6px; padding: 0; font-weight: 500 }
  .pills { display: flex; flex-wrap: wrap; gap: 8px }
  .end { justify-content: flex-end }
</style>
