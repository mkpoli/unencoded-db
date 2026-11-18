<script lang="ts">
  import type { Path } from 'opentype.js'
  import { onDestroy, untrack } from 'svelte'
  import { href, t } from '$lib/t'
  import { recordCode } from '$lib/code'
  import { privateCode } from '$lib/private-code'
  import { GLYPH_STYLE, type GlyphStyle } from '$lib/composer'
  import Seo from '$lib/components/Seo.svelte'
  import FontDownload from '$lib/components/FontDownload.svelte'
  import GlyphStyleTabs from '$lib/components/GlyphStyleTabs.svelte'
  import type { PageProps } from './$types'

  let { data }: PageProps = $props()
  const glyph = (id: number) => String.fromCodePoint(privateCode(id))
  const rows = $derived(data.catalogue.records)
  const positions = $derived(new Map(rows.map((row, index) => [glyph(row.id), index])))
  const pageSize = 24
  const sampleLimit = 256
  let offset = $state(0), size = $state(64), retry = $state(0)
  let style = $state<GlyphStyle>(untrack(() => data.glyphStyle ?? GLYPH_STYLE))
  let sample = $state(untrack(() => rows.slice(0, 4).map(row => glyph(row.id)).join('')))
  let editor: HTMLTextAreaElement
  const start = $derived(Math.min(offset, Math.floor(Math.max(0, rows.length - 1) / pageSize) * pageSize))
  const visible = $derived(rows.slice(start, start + pageSize))
  const selection = $derived.by(() => {
    const indices = new Set(visible.map((_, i) => start + i))
    for (const char of sample) {
      const index = positions.get(char)
      if (index !== undefined) indices.add(index)
    }
    return [...indices].sort((a,b) => a-b).join(',')
  })
  const instance = $props.id()
  const family = 'RCCPreview' + instance.replace(/[^a-zA-Z0-9]/g, '')
  let previewState = $state<'loading' | 'retrying' | 'ready' | 'error'>('loading')
  let failedCount = $state(0)
  const request = $derived.by(() => ({
    face: data.catalogue.styles.find(face => face.style === style),
    records: selection ? selection.split(',').map(i => rows[Number(i)]) : [],
    paths: new Map<number, Path>()
  }))
  let installed: FontFace | undefined
  onDestroy(() => { if (installed) document.fonts.delete(installed) })
  $effect(() => {
    const { face, records, paths } = request
    void retry
    if (!face || !records.length) {
      failedCount = 0
      previewState = 'ready'
      if (installed) document.fonts.delete(installed)
      installed = undefined
      return
    }
    const controller = new AbortController()
    previewState = paths.size ? 'retrying' : 'loading'
    if (!paths.size) failedCount = 0
    const timer = setTimeout(async () => {
      try {
        const { previewFont } = await import('$lib/font-preview')
        const { buffer, failed } = await previewFont(records, face, controller.signal, paths)
        if (controller.signal.aborted) return
        if (!buffer) { previewState = 'error'; return }
        const loaded = await new FontFace(family, buffer).load()
        if (controller.signal.aborted) return
        document.fonts.add(loaded)
        if (installed) document.fonts.delete(installed)
        installed = loaded
        failedCount = failed.length
        previewState = 'ready'
      } catch {
        if (!controller.signal.aborted) previewState = 'error'
      }
    }, 80)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  })
  function insert(char: string) {
    if (sample.length - (editor.selectionEnd - editor.selectionStart) + char.length > sampleLimit) return
    editor.setRangeText(char, editor.selectionStart, editor.selectionEnd, 'end')
    sample = editor.value
    editor.focus()
  }
</script>

<Seo title={t('nav.fonts')} />
<div class="page fonts" style:--preview={family}>
  <div class="heading"><h1>{t('nav.fonts')}</h1><FontDownload /></div>
  <section class="tester">
    <div class="toolbar">
      <h2><label for="font-sample">{t('fonts.tester')}</label></h2>
      <GlyphStyleTabs value={style} onchange={value => style = value} />
    </div>
    <textarea id="font-sample" bind:this={editor} bind:value={sample} maxlength={sampleLimit} spellcheck="false" style:font-size={size + 'px'}></textarea>
    <div class="controls">
      <label>{t('fonts.size')} <input type="range" min="24" max="120" step="2" bind:value={size} /> <output>{size} px</output></label>
      <span role="status">{previewState === 'loading' || previewState === 'retrying' ? t('about.fontPreparing') : previewState === 'error' ? t('fonts.previewError') : failedCount ? t('fonts.partial', { n: failedCount }) : ''}</span>
      {#if previewState === 'error' || failedCount}<button class="button" disabled={previewState === 'retrying'} onclick={() => retry++}>{t('fonts.retry')}</button>{/if}
    </div>
  </section>
  <section>
    <div class="toolbar gallery-head">
      <h2>{t('fonts.gallery')}</h2>
      {#if rows.length}
        <div class="row">
          <span>{start + 1}–{start + visible.length} / {rows.length}</span>
          <button class="button" aria-label={t('fonts.prev')} disabled={start === 0} onclick={() => offset = start - pageSize}>←</button>
          <button class="button" aria-label={t('fonts.next')} disabled={start + pageSize >= rows.length} onclick={() => offset = start + pageSize}>→</button>
        </div>
      {/if}
    </div>
    {#if rows.length}
      <ul class="gallery">
        {#each visible as row (row.id)}
          <li>
            <button class="specimen" aria-label={t('fonts.insert', { code: recordCode(row.id) })} title={t('fonts.insert', { code: recordCode(row.id) })} onclick={() => insert(glyph(row.id))}>{previewState === 'ready' || previewState === 'retrying' ? glyph(row.id) : '·'}</button>
            <a href={href('/entry/' + row.id)}>{recordCode(row.id)}</a>
            <small>U+{privateCode(row.id).toString(16).toUpperCase()}</small>
          </li>
        {/each}
      </ul>
    {:else}<p>{t('fonts.empty')}</p>{/if}
  </section>
</div>

<style>
  .fonts { max-width: 1100px; display: grid; gap: 26px }
  .heading, .toolbar, .controls { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 16px }
  .heading, .toolbar { justify-content: space-between }
  .tester { border: 1px solid var(--line); border-radius: 10px; background: var(--surface); overflow: hidden }
  .tester .toolbar, .controls { padding: 12px 18px }
  .controls { border-top: 1px solid var(--line); color: var(--muted); font-size: .85rem }
  .controls label { display: flex; align-items: center; gap: 8px }
  .controls input { max-width: 22vw; accent-color: var(--accent) }
  output { font-variant-numeric: tabular-nums }
  textarea { display: block; width: 100%; resize: vertical; min-height: 2.6em; padding: .32em 18px; border: 0; background: var(--surface-sunken); font-family: var(--preview), var(--cjk), sans-serif; line-height: 1.4 }
  textarea:focus-visible { outline-offset: -3px }
  .gallery-head { margin-bottom: 12px }
  .gallery-head .row { font-size: .85rem; color: var(--muted); font-variant-numeric: tabular-nums }
  .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; padding: 0; margin: 0; list-style: none }
  li { display: grid; justify-items: center; padding: 0 0 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface) }
  .specimen { width: 100%; min-height: 80px; border: 0; border-radius: 7px; background: transparent; font: 3.2rem/1.2 var(--preview), var(--cjk), sans-serif; cursor: pointer }
  .specimen:hover { background: var(--surface-sunken) }
  li a, li small { font: .78rem/1.5 monospace }
  li a { color: var(--accent) }
  li small { color: var(--muted) }
</style>
