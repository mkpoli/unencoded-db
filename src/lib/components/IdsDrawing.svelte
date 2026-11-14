<script lang="ts" module>
  // One composer of each kind for the page visit: a reader who leaves the form and comes back reuses its
  // worker and the export files it has already read. Parts are drawn one by one only where a layout moves them.
  import type { ComposerPreview } from 'ids-input/composer'
  import type { DocumentSession } from 'ids-input/document'
  import { COMPOSER_VERSION } from '$lib/composer'
  import { idsMessages } from '$lib/ids-messages'

  const composers = new Map<boolean, Promise<ComposerPreview>>()
  function composer(separate: boolean) {
    let found = composers.get(separate)
    if (!found) {
      found = import('ids-input/composer').then(({ composerPreview }) => composerPreview({ base: `https://glyphatlas.org/atlas/composer/${COMPOSER_VERSION}`, separate }))
      composers.set(separate, found)
      found.catch(() => composers.delete(separate))
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
  // view. While the layout is being adjusted the plate is larger, and a part is dragged, scaled and
  // turned on it. The layout is sent as `layout` with the description it was drawn over as `layout_ids`.
  // A description still being built is drawn with its empty places, and `chosen` marks the one being filled.
  import { onMount, untrack } from 'svelte'
  import { parse } from 'ids-input'
  import { cleanIds } from '$lib/ids'
  import { carryLayout, layoutText, placeOf, type Layout } from '$lib/layout'
  import { locale } from '$lib/t'

  let { ids, layout = null, chosen = null, adjusting = $bindable(false) }: { ids: string; layout?: Layout | null; chosen?: number[] | null; adjusting?: boolean } = $props()

  const at = locale()
  const sequence = $derived(cleanIds(ids))
  // Empty places are parts of a description that is being built; an empty field is no description.
  const tree = $derived(sequence ? parse(sequence, { open: true }).tree : undefined)
  const drawn = $derived(tree !== undefined)
  const whole = $derived(parse(sequence).tree !== undefined)

  let host = $state<HTMLElement>()
  let near = $state(false)
  let kit = $state.raw<Tools | null>(null)
  // The composer that last loaded, and whether it draws parts one by one: the plate adjusts only what such a one drew.
  let preview = $state.raw<{ draw: ComposerPreview; separate: boolean } | null>(null)
  let session = $state.raw<DocumentSession | null>(null)
  // The session's document changes in place; its version tells the preview to read it again.
  let version = $state(0)
  // The layout, and the description it is a layout of: the record's own until the description changes.
  let stated = $state.raw(untrack(() => layout))
  let statedFor = $state(untrack(() => cleanIds(ids)))
  let picked = $state.raw<number[] | null>(null)
  let undoable = $state(false)
  const moved = $derived(Boolean(stated))
  const separate = $derived(adjusting || moved)
  const parted = $derived(separate && preview?.separate === true)
  const pickedMoved = $derived(Boolean(picked && stated?.[placeOf(picked)]))

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

  // The export's manifest and layout are read while the first description is still being typed.
  $effect(() => {
    if (!near) return
    let live = true
    const kind = separate
    composer(kind).then(found => { found.warm(); if (live) preview = { draw: found, separate: kind } }, () => {})
    return () => { live = false }
  })

  // The document follows the description. A move stays with its part: a description that keeps the
  // part at its place keeps the move, and one that replaces the part does not. Text that is no
  // description yet leaves the layout with the last one that was.
  $effect(() => {
    const found = kit, text = sequence
    if (!found) return
    untrack(() => {
      if (session && text === statedFor) return
      const carried = carryLayout(stated, statedFor, text)
      const document = found.layoutDocument(text, carried)
      if (!document) { session = null; picked = null; undoable = false; return }
      if (session) session.open(document)
      else session = found.createDocumentSession(document)
      stated = carried
      statedFor = text
      picked = null
      undoable = false
      version++
    })
  })

  // After a move, an undo or a reset: what the session now holds.
  function read() {
    if (!kit || !session) return
    stated = kit.documentLayout(session.document, statedFor)
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

<div class="drawing" class:adjusting bind:this={host}>
  {#if kit && preview && tree !== undefined}
    <div class="stage">
      <kit.IdsPreview adapter={{ preview: preview.draw }} {tree} chosen={adjusting ? picked : chosen} messages={kit.messages} locale={at} small={false} notes={false} delay={140}
        session={parted ? session : null} {version} editable={adjusting && parted} onchoose={path => picked = path} onedit={read} />
    </div>
  {:else}
    <div class="plate" class:empty={!drawn} role={drawn ? 'img' : undefined} aria-label={drawn ? sequence : undefined} aria-hidden={drawn ? undefined : 'true'}>
      {#if drawn}<span class="sequence">{sequence}</span>{/if}
    </div>
  {/if}
  {#if kit && whole}
    <div class="tools">
      <button type="button" class="tool" aria-pressed={adjusting} title={kit.say('ids.adjust.hint')} onclick={() => adjusting = !adjusting}>{kit.say('ids.adjust.title')}</button>
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
  .tools { display: flex; flex-wrap: wrap; gap: 6px }
  .tool { min-height: 30px; padding: 0 10px; border: 1px solid var(--line-strong); border-radius: 7px; background: var(--surface); color: var(--ink); font: inherit; font-size: 12.5px; cursor: pointer }
  .tool:hover:not(:disabled) { border-color: var(--ink) }
  .tool[aria-pressed='true'] { border-color: var(--accent); background: var(--accent-light); color: var(--accent) }
  .tool:disabled { color: var(--muted); border-color: var(--line); cursor: default }
</style>
