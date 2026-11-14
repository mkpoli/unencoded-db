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
    const [{ IdsPreview, translator }, { createDocumentSession }, { documentLayout, layoutDocument }, messages] = await Promise.all([
      import('ids-input/svelte'), import('ids-input/document'), import('$lib/layout-document'), idsMessages(locale),
    ])
    return { IdsPreview, createDocumentSession, documentLayout, layoutDocument, messages, say: translator(messages, locale) }
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
  // moves its parts. The composer runs in the browser and is loaded when the plate first appears. While
  // the layout is being adjusted the plate is larger, and a part is dragged, scaled and turned on it.
  // The layout is sent as `layout`; a description nobody adjusted sends it empty.
  import { onMount, untrack } from 'svelte'
  import { parse } from 'ids-input'
  import { cleanIds } from '$lib/ids'
  import { layoutText, type Layout } from '$lib/layout'
  import { locale } from '$lib/t'

  let { ids, layout = null, adjusting = $bindable(false) }: { ids: string; layout?: Layout | null; adjusting?: boolean } = $props()

  const at = locale()
  const sequence = $derived(cleanIds(ids))
  const tree = $derived(parse(sequence).tree)
  const whole = $derived(tree !== undefined)

  let kit = $state.raw<Tools | null>(null)
  let preview = $state.raw<ComposerPreview | null>(null)
  let session = $state.raw<DocumentSession | null>(null)
  // The session's document changes in place; its version tells the preview to read it again.
  let version = $state(0)
  let stated = $state.raw(untrack(() => layout))
  let chosen = $state.raw<number[] | null>(null)
  let undoable = $state(false)
  const moved = $derived(Boolean(stated))
  const separate = $derived(adjusting || moved)
  const chosenMoved = $derived(Boolean(chosen && stated?.[chosen.join('.')]))

  onMount(() => {
    let live = true
    load(at).then(found => { if (live) kit = found }, () => {})
    return () => { live = false }
  })

  // The export's manifest and layout are read while the first description is still being typed.
  $effect(() => {
    let live = true
    composer(separate).then(found => { found.warm(); if (live) preview = found }, () => {})
    return () => { live = false }
  })

  // The document follows the description: a part that was moved stays moved while its place holds a
  // part, and an emptied field starts again.
  $effect(() => {
    const found = kit, text = sequence, parts = tree
    if (!found) return
    untrack(() => {
      if (parts === undefined) {
        if (!text) { session = null; stated = null; chosen = null; adjusting = false; undoable = false }
        return
      }
      if (session) {
        try { session.sync(parts) } catch { return }
      } else {
        const document = found.layoutDocument(text, stated)
        if (!document) return
        session = found.createDocumentSession(document)
      }
      read()
    })
  })

  function read() {
    if (!kit || !session) return
    stated = kit.documentLayout(session.document, sequence)
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

<div class="drawing" class:adjusting>
  {#if kit && preview && whole && tree !== undefined}
    <div class="stage">
      <kit.IdsPreview adapter={{ preview }} {tree} {chosen} messages={kit.messages} locale={at} small={false} notes={false} delay={140}
        session={separate ? session : null} {version} editable={adjusting} onchoose={path => chosen = path} onedit={read} />
    </div>
  {:else}
    <div class="plate" class:empty={!whole} role={whole ? 'img' : undefined} aria-label={whole ? sequence : undefined} aria-hidden={whole ? undefined : 'true'}>
      {#if whole}<span class="sequence">{sequence}</span>{/if}
    </div>
  {/if}
  {#if kit && whole}
    <div class="tools">
      <button type="button" class="tool" aria-pressed={adjusting} title={kit.say('ids.adjust.hint')} onclick={() => adjusting = !adjusting}>{kit.say('ids.adjust.title')}</button>
      {#if adjusting}
        <button type="button" class="tool" disabled={!undoable} onclick={undo}>{kit.say('ids.undo.label')}</button>
        <button type="button" class="tool" disabled={!chosenMoved} onclick={reset}>{kit.say('ids.adjust.reset')}</button>
      {/if}
    </div>
  {/if}
  <input type="hidden" name="layout" value={layoutText(stated)} />
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
