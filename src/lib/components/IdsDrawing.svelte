<script lang="ts" module>
  // One composer of each kind for the page visit: a reader who leaves the form and comes back reuses its
  // worker and the export files it has already read. Parts are drawn one by one only where a layout moves them.
  import type { ComposerPreview } from 'han-compose'
  import type { DocumentSession } from 'ids-input/document'
  import { composerUrl, type GlyphStyle } from '$lib/composer'
  import { composerDataFor } from '$lib/composer-data'
  import { idsMessages } from '$lib/ids-messages'

  const composers = new Map<string, Promise<ComposerPreview>>()
  function composer(separate: boolean, style: GlyphStyle) {
    const key = `${style}:${separate}`
    let found = composers.get(key)
    if (!found) {
      found = import('han-compose').then(({ composerPreview, dataUrls }) => composerPreview({ base: composerUrl(style), fontStyle: style, separate, loaders: { ...dataUrls, ...composerDataFor(style) } }))
      composers.set(key, found)
      found.catch(() => composers.delete(key))
    }
    return found
  }

  // ids-input's preview and layer documents, with its catalogue for the page's language.
  async function tools(locale: string) {
    const [{ IdsPreview, translator }, { createDocumentSession }, { chosenPath, documentLayout, layoutDocument }, messages] = await Promise.all([
      import('ids-input/svelte'), import('ids-input/document'), import('$lib/layout-document'), idsMessages(locale),
    ])
    return { IdsPreview, createDocumentSession, chosenPath, documentLayout, layoutDocument, messages, say: translator(messages, locale) }
  }
  type Tools = Awaited<ReturnType<typeof tools>>
  const asked = new Map<string, Promise<Tools>>()
  function load(locale: string) {
    let found = asked.get(locale)
    if (!found) {
      asked.set(locale, found = tools(locale))
      found.catch(() => asked.delete(locale))
    }
    return found
  }
</script>

<script lang="ts">
  // A description drawn by han-compose as it is typed, on a plate beside its field, and the layout that
  // moves its parts. The composer runs in the browser and is loaded when the plate first comes into
  // view. The face being adjusted is drawn large and the other glyph styles small beside it, each with its
  // own layout; picking a small one makes it the large one. While the layout is being adjusted the plate is
  // larger, and a part is dragged, scaled and turned on it. The layout is sent as `layout` with the
  // description it was drawn over as `layout_ids`.
  // A description still being built is drawn with its empty places, and `chosen` marks the one being filled.
  import { onMount, tick, untrack } from 'svelte'
  import { parse } from 'ids-input'
  import { cleanIds } from '$lib/ids'
  import { carryLayout, layoutForStyle, layoutText, placeOf, withStyleLayout, type Layout } from '$lib/layout'
  import { page } from '$app/state'
  import { GLYPH_STYLES, glyphStyleOf } from '$lib/composer'
  import { locale, t } from '$lib/t'
  import GlyphFace from './GlyphFace.svelte'

  let { ids, layout = null, chosen = null, adjusting = $bindable(false) }: { ids: string; layout?: Layout | null; chosen?: number[] | null; adjusting?: boolean } = $props()

  const at = locale()
  const uid = $props.id()
  let selectedStyle = $state<GlyphStyle | null>(null)
  const style = $derived(selectedStyle ?? glyphStyleOf(page.data.glyphStyle))
  const sequence = $derived(cleanIds(ids))
  // Empty places are parts of a description that is being built; an empty field is no description.
  const tree = $derived(sequence ? parse(sequence, { open: true }).tree : undefined)
  const drawn = $derived(tree !== undefined)
  const whole = $derived(parse(sequence).tree !== undefined)

  let host = $state<HTMLElement>()
  let near = $state(false)
  let kit = $state.raw<Tools | null>(null)
  // The composers that have loaded, by style and by whether they draw parts one by one: a plate adjusts
  // only what such a one drew, and shows a face's layout only through one.
  let drawers = $state.raw(new Map<string, ComposerPreview>())
  const sessions = new Map<GlyphStyle, DocumentSession>()
  let session = $state.raw<DocumentSession | null>(null)
  // The session's document changes in place; its version tells the preview to read it again.
  let version = $state(0)
  // The layout, and the description it is a layout of: the record's own until the description changes.
  let stated = $state.raw(untrack(() => layout))
  let statedFor = $state(untrack(() => cleanIds(ids)))
  let picked = $state.raw<number[] | null>(null)
  let undoable = $state(false)
  const activeLayout = $derived(layoutForStyle(stated, style))
  const separate = $derived(adjusting || Boolean(activeLayout))
  const others = $derived(GLYPH_STYLES.filter(face => face !== style))
  const separateFor = (face: GlyphStyle) => face === style ? separate : Boolean(layoutForStyle(stated, face))
  // The composer a face wants, or its other one until that has loaded, so a plate is not left blank.
  function drawerFor(face: GlyphStyle) {
    const wanted = separateFor(face)
    const exact = drawers.get(`${face}:${wanted}`)
    if (exact) return { draw: exact, separate: wanted }
    const other = drawers.get(`${face}:${!wanted}`)
    return other ? { draw: other, separate: !wanted } : null
  }
  const preview = $derived(drawerFor(style))
  const parted = $derived(separate && preview?.separate === true)
  // A small face shows its own layout as a fixed document over the same description. A document is
  // kept while its face's layout stays the same, so a move on the large face redraws none of the others.
  const documents = new Map<string, ReturnType<Tools['layoutDocument']>>()
  function faceDocument(face: GlyphStyle) {
    const moved = layoutForStyle(stated, face)
    if (!kit || !moved || sequence !== statedFor) return null
    const key = `${statedFor} ${layoutText(moved)}`
    let found = documents.get(key)
    if (found === undefined) {
      if (documents.size >= 32) documents.clear()
      documents.set(key, found = kit.layoutDocument(statedFor, moved))
    }
    return found
  }
  let step = $state<'idle' | 'loading' | 'composed' | 'final' | 'failed' | 'capped' | 'unavailable'>('idle')
  const pickedMoved = $derived(Boolean(picked && activeLayout?.[placeOf(picked)]))

  // A plate in a folded form asks for nothing until the form is opened.
  onMount(() => {
    if (!host) return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { near = true; observer.disconnect() }
    }, { rootMargin: '400px' })
    observer.observe(host)
    return () => observer.disconnect()
  })

  $effect(() => {
    if (!near) return
    let live = true
    load(at).then(found => { if (live) kit = found }, () => {})
    return () => { live = false }
  })

  // The exports' manifests and layouts are read while the first description is still being typed.
  // A face asks for another composer only when the kind it wants changes.
  const wanted = $derived(GLYPH_STYLES.map(face => `${face}:${separateFor(face)}`).join(' '))
  $effect(() => {
    if (!near) return
    let live = true
    for (const key of wanted.split(' ')) {
      if (untrack(() => drawers.has(key))) continue
      const [face, kind] = key.split(':') as [GlyphStyle, string]
      composer(kind === 'true', face).then(found => {
        found.warm()
        if (live && !drawers.has(key)) drawers = new Map(drawers).set(key, found)
      }, () => {})
    }
    return () => { live = false }
  })
  // The picked face becomes the large one, and the focus follows it there.
  let faces = $state<HTMLElement>()
  async function pick(face: GlyphStyle) {
    selectedStyle = face
    await tick()
    faces?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus()
  }

  // The document follows the description. A move stays with its part: a description that keeps the
  // part at its place keeps the move, and one that replaces the part does not. Text that is no
  // description yet leaves the layout with the last one that was.
  $effect(() => {
    const found = kit, text = sequence, face = style
    if (!found) return
    untrack(() => {
      let next = text === statedFor ? sessions.get(face) : undefined
      if (!next) {
        const carried = carryLayout(stated, statedFor, text)
        const document = found.layoutDocument(text, layoutForStyle(carried, face))
        if (!document) { session = null; picked = null; undoable = false; return }
        if (text !== statedFor) sessions.clear()
        stated = carried
        statedFor = text
        next = found.createDocumentSession(document)
        sessions.set(face, next)
      }
      session = next
      picked = found.chosenPath(next)
      undoable = next.canUndo
      version++
    })
  })

  // After a move, an undo or a reset: what the session now holds.
  function read() {
    if (!kit || !session) return
    stated = withStyleLayout(stated, style, kit.documentLayout(session.document, statedFor))
    picked = kit.chosenPath(session)
    undoable = session.canUndo
    version++
  }
  function undo() {
    if (session?.undo()) read()
  }
  function reset() {
    if (!session?.chosen) return
    session.clearTransform()
    read()
  }
  $effect(() => { if (!whole) adjusting = false })
</script>

{#snippet fallback()}
  <div class="plate" class:empty={!drawn} role={drawn ? 'img' : undefined} aria-label={drawn ? sequence : undefined} aria-hidden={drawn ? undefined : 'true'}>
    {#if drawn}<span class="sequence">{sequence}</span>{/if}
  </div>
{/snippet}

<div class="drawing" class:adjusting bind:this={host}>
  {#if tree !== undefined}
    <div class="faces" role="group" aria-label={t('nav.glyphStyle')} bind:this={faces}>
      <div class="main">
        <GlyphFace {style} current onpick={pick}>
          {#if kit && preview}
            <!-- A preview keeps its last drawing until the next is done; a face never shows another's. -->
            <div class="stage">
              {#key style}
                <kit.IdsPreview adapter={{ preview: preview.draw }} {tree} chosen={adjusting ? picked : chosen} messages={kit.messages} locale={at} small={false} notes={false} delay={140}
                  session={parted ? session : null} preserveStroke={style === 'sans'} {version} bind:step editable={adjusting && parted && step === 'composed'} onchoose={path => picked = path} onedit={read} />
              {/key}
            </div>
          {:else}
            {@render fallback()}
          {/if}
        </GlyphFace>
      </div>
      <div class="others">
        {#each others as face (face)}
          {@const drawer = drawerFor(face)}
          <GlyphFace style={face} onpick={pick}>
            <div class="mini" aria-hidden="true">
              {#if kit && drawer}
                <kit.IdsPreview adapter={{ preview: drawer.draw }} {tree} messages={kit.messages} locale={at} small={false} notes={false} delay={140}
                  document={drawer.separate ? faceDocument(face) : null} preserveStroke={face === 'sans'} />
              {/if}
            </div>
          </GlyphFace>
        {/each}
      </div>
    </div>
  {:else}
    {@render fallback()}
  {/if}
  {#if kit && whole}
    <div class="tools">
      <button type="button" class="tool" aria-pressed={adjusting} title={kit.say('ids.adjust.hint')} onclick={() => adjusting = !adjusting}>{kit.say(adjusting ? 'ids.adjust.done' : 'ids.adjust.title')}</button>
      {#if adjusting}
        <button type="button" class="tool" disabled={!undoable} onclick={undo}>{kit.say('ids.undo.label')}</button>
        <button type="button" class="tool" disabled={!pickedMoved} onclick={reset}>{kit.say('ids.adjust.reset')}</button>
      {/if}
    </div>
  {/if}
  <input type="hidden" name="layout" value={layoutText(stated)} />
  <input type="hidden" name="layout_ids" value={statedFor} />
</div>

<style>
  .drawing { display: flex; flex-direction: column; gap: 8px; min-width: 0 }
  .plate, .stage :global(.ids-preview-large) { border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--ink) }
  .plate { display: grid; place-items: center; width: 100%; aspect-ratio: 1; padding: 7%; overflow: hidden }
  .plate.empty { background: var(--surface-sunken) }
  .plate.empty::before { content: ''; width: 22%; aspect-ratio: 1; border: 1.5px dashed var(--line-strong); border-radius: 4px }
  .sequence { color: var(--muted); font-size: 20px; line-height: 1.3; text-align: center; overflow-wrap: anywhere }
  .stage {
    --ids-preview-size: 100%;
    --ids-ink: var(--ink); --ids-muted: var(--muted); --ids-line: var(--line); --ids-surface: var(--surface);
    --ids-accent: var(--accent); --ids-focus: var(--focus-ring); --ids-fault: var(--wrong);
  }
  .stage :global(.ids-preview) { width: 100% }
  .adjusting .stage :global(.ids-preview-large) { border-color: var(--accent); touch-action: none }
  /* The plate's own border shows the focus; the drawing inside it has none of its own. */
  .stage :global(.ids-preview-large svg[tabindex]:is(:focus, :focus-visible)) { outline: none }
  .stage :global(.ids-preview-large:has(svg:focus-visible)) { outline: 3px solid var(--focus-ring); outline-offset: 2px }
  /* The badge speaks only when the composer could not draw the description as written. */
  .stage :global(.ids-preview:is([data-label='draft'], [data-label='loading'], [data-label='final']) .ids-preview-meta) { display: none }
  /* The face being adjusted over a row of the other four, as wide as it is. */
  .faces { display: flex; flex-direction: column; gap: 10px; min-width: 0 }
  .main { --face-size: 100%; --face-plate: transparent }
  .others { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px }
  .others :global(.face) { --face-size: 100% }
  .others :global(.name) { font-size: 11px }
  .stage, .mini { width: 100% }
  .mini {
    --ids-preview-size: 100%; --ids-ink: var(--ink); --ids-muted: var(--muted); --ids-line: transparent; --ids-surface: transparent;
    --ids-accent: var(--accent); --ids-fault: var(--wrong);
  }
  .mini :global(.ids-preview) { width: 100% }
  .mini :global(:is(.ids-preview-meta, .ids-preview-note)) { display: none }
  .tools { display: flex; flex-wrap: wrap; gap: 6px }
  .tool { min-height: 30px; padding: 0 10px; border: 1px solid var(--line-strong); border-radius: 7px; background: var(--surface); color: var(--ink); font: inherit; font-size: 12.5px; cursor: pointer }
  .tool:hover:not(:disabled) { border-color: var(--ink) }
  .tool[aria-pressed='true'] { border-color: var(--accent); background: var(--accent-light); color: var(--accent) }
  .tool:disabled { color: var(--muted); border-color: var(--line); cursor: default }
</style>
