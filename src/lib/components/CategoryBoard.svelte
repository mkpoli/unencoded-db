<script lang="ts">
  // The categories laid out to arrange. The top level is a tray of trays: each top-level category is a tray
  // holding the categories under it, and a category with categories under it is a tray within its parent's.
  // A category is moved by dragging its chip with a mouse or a pen, by picking it up with its grip and
  // clicking a tray, a chip or a gap (the touch path), or from the keyboard: Enter on the grip picks it up,
  // the arrows aim, Enter puts it down and Escape lets go. Every change shows at once and stands or is put
  // back when the site answers; a change someone made meanwhile refuses it, and the board reads them again.
  // The latest change of each category can be undone from the list under the board.
  import { tick } from 'svelte'
  import { flip } from 'svelte/animate'
  import { crossfade } from 'svelte/transition'
  import { cubicOut } from 'svelte/easing'
  import { invalidateAll } from '$app/navigation'
  import { GENRE_DEPTH_MAX, GENRE_LENGTH_MAX, categoryTree, cleanGenre, flatten, moveRefusal, moved, validGenreName, type Category, type CategoryNode } from '$lib/genres'
  import type { CategoryChange } from '$lib/server/categories'
  import { href, t, when } from '$lib/t'

  let { categories, changes = [] }: { categories: Category[]; changes?: CategoryChange[] } = $props()
  // What the board shows before the site has answered; null once it has.
  let local = $state.raw<Category[] | null>(null)
  const shown = $derived(local ?? categories)
  const roots = $derived(categoryTree(shown))
  const nodes = $derived(flatten(roots))
  const nodeOf = (name: string) => nodes.find(node => node.name === name)
  const top = $derived(t('field.genreTopLevel'))

  let board = $state<HTMLElement>()
  let held = $state<string | null>(null), over = $state<string | null>(null), dragging = $state(false)
  let busy = $state<string | null>(null), error = $state(''), said = $state('')
  let renaming = $state<string | null>(null), adding = $state<string | null>(null)

  // A target is `parent|index`, the gap before the index-th category under a parent, or `parent|` for the
  // parent's tray, which puts a category last there. The top is the empty parent.
  const keyOf = (parent: string | null, index: number | null = null) => `${parent ?? ''}|${index ?? ''}`
  const parse = (key: string) => { const [parent, index] = key.split('|'); return { parent: parent || null, index: index === '' ? null : Number(index) } }
  const childrenOf = (parent: string | null) => parent === null ? roots : nodeOf(parent)?.children ?? []
  const parentOf = (name: string) => nodes.find(node => node.children.some(child => child.name === name))?.name ?? null
  const labelOf = (parent: string | null) => parent === null ? top : nodeOf(parent)?.label ?? parent

  // Where a target puts the held category, as its place among the categories there once it has left its
  // own; null where it cannot go or would stay where it is.
  function landing(key: string): { parent: string | null; position: number } | null {
    if (!held) return null
    const { parent, index } = parse(key)
    if (moveRefusal(nodes, held, parent)) return null
    const from = parentOf(held), siblings = childrenOf(parent), at = siblings.findIndex(node => node.name === held)
    if (index === null) return parent === from ? null : { parent, position: siblings.length }
    if (parent === from && (index === at || index === at + 1)) return null
    return { parent, position: parent === from && index > at ? index - 1 : index }
  }
  const targets = $derived.by(() => {
    if (!held) return new Set<string>()
    const parents = [null, ...nodes.filter(node => node.level < GENRE_DEPTH_MAX).map(node => node.name)]
    return new Set(parents.flatMap(parent => [keyOf(parent), ...childrenOf(parent).map((_, index) => keyOf(parent, index))]).filter(key => landing(key)))
  })
  // What a target says of what is held, to a reader who cannot see where it would go.
  const offer = (key: string) => { const { parent, index } = parse(key); return index === null ? t('categories.under', { name: labelOf(parent) }) : t('categories.before', { name: childrenOf(parent)[index]?.label ?? '' }) }

  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches
  const [send, receive] = crossfade({ duration: () => calm() ? 0 : 240, easing: cubicOut })
  const slide = { duration: () => calm() ? 0 : 200, easing: cubicOut }
  // A chip on its way out of a tray is inert while it leaves; the one that stands is the other.
  const gripOf = (name: string) => [...board?.querySelectorAll<HTMLElement>(`[data-grip="${CSS.escape(name)}"]`) ?? []].find(grip => !grip.closest('[inert]'))

  // What the site's refusal says, by its code.
  const SAID: Record<string, string> = { slow: 'slow', conflict: 'categoryConflict', too_large: 'categoryTooLarge', exists: 'categoryExists', used: 'categoryChange' }
  // A change shows at once; the site's answer keeps it and reads the categories again, or puts the board
  // back. A refusal reads them again too, so the board shows what stands now. Answers whether it was kept.
  async function save(fields: Record<string, string | number>, mark: string, change: () => void = () => {}) {
    error = ''; busy = mark
    change()
    let kept = false
    try {
      const body = new FormData()
      for (const [name, value] of Object.entries(fields)) body.set(name, String(value))
      const response = await fetch('/api/categories', { method: 'POST', body })
      const answer = await response.json().catch(() => ({})) as { code?: string; created?: boolean }
      const code = response.status === 429 ? 'slow' : answer.code
      if (!response.ok) error = t(`error.${SAID[code ?? ''] ?? (fields.action === 'create' ? 'category' : 'categoryChange')}`)
      else if (fields.action === 'create' && !answer.created) error = t('error.categoryExists')
      else kept = true
    } catch {
      error = t('error.categoryChange')
    }
    try { await invalidateAll() } catch { /* the board keeps what it read */ }
    local = null; busy = null
    return kept
  }
  const revOf = (name: string) => nodeOf(name)?.rev ?? 0
  const focusAdd = (parent: string | null) => [...board?.querySelectorAll<HTMLElement>(`[data-add="${CSS.escape(keyOf(parent))}"]`) ?? []].find(button => !button.closest('[inert]'))?.focus({ preventScroll: true })

  function release() { held = null; over = null; dragging = false; said = '' }
  function pick(name: string) {
    if (busy || renaming || adding !== null) return
    held = name; over = null
    said = nodeOf(name)?.label ?? ''
  }
  async function drop(key: string) {
    const name = held, place = landing(key)
    release()
    if (!name || !place) return
    said = `${nodeOf(name)?.label ?? name} · ${offer(key)}`
    await save({ action: 'move', name, rev: revOf(name), parent: place.parent ?? '', position: place.position }, name, () => { local = moved(shown, name, place.parent, place.position) })
    await tick()
    gripOf(name)?.focus({ preventScroll: true })
  }

  // ---------- Pointer ----------
  // A drag with a mouse or a pen; a touch picks up with a tap on the grip, so the board still scrolls.
  let grip: { pointer: number; x: number; y: number; node: HTMLElement; name: string; moved: boolean } | null = null
  let skipClick = false
  // The target at a point: a chip's edges are the gaps on either side of it; its middle, a tray or the
  // board around them are the trays that hold them, the nearest that can take what is held first.
  function aim(x: number, y: number) {
    const element = document.elementsFromPoint(x, y).find(found => !grip?.node.contains(found) && board?.contains(found))
    const chip = element?.closest<HTMLElement>('[data-chip]')
    if (chip) {
      const box = chip.getBoundingClientRect(), along = (x - box.left) / box.width
      if (along < .25 && targets.has(chip.dataset.before!)) return chip.dataset.before!
      if (along > .75 && targets.has(chip.dataset.after!)) return chip.dataset.after!
    }
    for (let at = element?.closest<HTMLElement>('[data-target]'); at; at = at.parentElement?.closest<HTMLElement>('[data-target]')) if (targets.has(at.dataset.target!)) return at.dataset.target!
    return null
  }
  function down(event: PointerEvent, name: string) {
    if (busy || held || renaming || adding !== null || event.button !== 0 || !event.isPrimary || event.pointerType === 'touch') return
    if ((event.target as Element).closest('input, .remove')) return
    grip = { pointer: event.pointerId, x: event.clientX, y: event.clientY, node: (event.currentTarget as HTMLElement).closest<HTMLElement>('[data-node]')!, name, moved: false }
    addEventListener('pointermove', move)
    addEventListener('pointerup', up)
    addEventListener('pointercancel', lost)
  }
  function move(event: PointerEvent) {
    if (!grip || event.pointerId !== grip.pointer) return
    const dx = event.clientX - grip.x, dy = event.clientY - grip.y
    if (!grip.moved) {
      if (Math.hypot(dx, dy) < 6) return
      grip.moved = true; dragging = true
      pick(grip.name)
      getSelection()?.removeAllRanges()
    }
    grip.node.style.translate = `${dx}px ${dy}px`
    const aimed = aim(event.clientX, event.clientY)
    if (aimed !== over) { over = aimed; said = aimed ? offer(aimed) : '' }
  }
  function settle(node: HTMLElement) {
    const from = node.style.translate
    node.style.translate = ''
    if (from && !calm()) node.animate([{ translate: from }, { translate: '0 0' }], { duration: 180, easing: 'ease-out' })
  }
  function stop() {
    removeEventListener('pointermove', move)
    removeEventListener('pointerup', up)
    removeEventListener('pointercancel', lost)
    const taken = grip
    grip = null
    return taken
  }
  function up(event: PointerEvent) {
    if (!grip || event.pointerId !== grip.pointer) return
    const { node, moved: dragged } = stop()!
    if (!dragged) return
    // The click that ends a drag is the drag's.
    skipClick = true; setTimeout(() => { skipClick = false })
    const to = over
    if (!to) { settle(node); release(); return }
    node.style.translate = ''
    void drop(to)
  }
  function lost(event: PointerEvent) {
    if (!grip || event.pointerId !== grip.pointer) return
    const { node, moved: dragged } = stop()!
    if (dragged) { settle(node); release() }
  }

  // ---------- Clicks and keys ----------
  function tap(event: MouseEvent, name: string) {
    if (skipClick) { skipClick = false; event.stopPropagation(); return }
    // With another category held, the click is the board's: it puts that one down here.
    if (held && held !== name) return
    event.stopPropagation()
    if (held === name) release()
    else pick(name)
  }
  function clicked(event: MouseEvent) {
    if (skipClick) { skipClick = false; return }
    if (!held) return
    const to = aim(event.clientX, event.clientY)
    if (to) void drop(to)
    else release()
  }
  function keys(event: KeyboardEvent, name: string) {
    if (held !== name) return
    const step = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[event.key]
    if (step) {
      event.preventDefault()
      // The arrows follow the targets as they stand on the board.
      const order = [...new Set([...board!.querySelectorAll<HTMLElement>('[data-target]')].map(element => element.dataset.target!))].filter(key => targets.has(key))
      const at = over ? order.indexOf(over) : -1
      over = order[at < 0 ? (step > 0 ? 0 : order.length - 1) : (at + step + order.length) % order.length] ?? null
      said = over ? offer(over) : ''
      if (over) board!.querySelector(`[data-target="${CSS.escape(over)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (over) void drop(over)
      else release()
    } else if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation()
      release()
    }
  }

  // ---------- Rename, add and delete ----------
  let cancelled = false
  const focus = (node: HTMLInputElement) => { node.focus(); node.select() }
  function typed(event: KeyboardEvent) {
    if (event.key === 'Enter') { event.preventDefault(); (event.currentTarget as HTMLInputElement).blur() }
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelled = true; (event.currentTarget as HTMLInputElement).blur() }
  }
  function startRename(name: string) {
    if (held || busy) return
    cancelled = false; renaming = name
  }
  async function rename(node: CategoryNode<Category>, value: string) {
    renaming = null
    const label = value.normalize('NFC').trim()
    if (cancelled || !label || label === node.label) { await tick(); gripOf(node.name)?.focus({ preventScroll: true }); return }
    if (!validGenreName(label)) { error = t('error.categoryChange'); return }
    await save({ action: 'rename', name: node.name, rev: node.rev, label }, node.name, () => { local = shown.map(category => category.name === node.name ? { ...category, label } : category) })
    await tick()
    gripOf(node.name)?.focus({ preventScroll: true })
  }
  function startAdd(parent: string | null) {
    if (held || busy) return
    cancelled = false; adding = keyOf(parent)
  }
  async function add(parent: string | null, value: string) {
    adding = null
    const typedName = value.normalize('NFC').trim()
    const name = cleanGenre(typedName, shown)
    if (cancelled || !typedName || !name || shown.some(category => category.name === name)) {
      if (!cancelled && typedName) error = t(name ? 'error.categoryExists' : 'error.category')
      await tick(); focusAdd(parent); return
    }
    const kept = await save({ action: 'create', name, parent: parent ?? '' }, name, () => { local = [...shown, { name, label: name, parent, position: Number.MAX_SAFE_INTEGER, rev: 0, n: 0, used: false }] })
    await tick()
    if (kept) gripOf(name)?.focus({ preventScroll: true })
    else focusAdd(parent)
  }
  async function remove(node: CategoryNode<Category>) {
    if (held || busy) return
    const parent = parentOf(node.name)
    const kept = await save({ action: 'delete', name: node.name, rev: node.rev }, node.name, () => { local = shown.filter(category => category.name !== node.name) })
    await tick()
    if (kept) focusAdd(parent)
    else gripOf(node.name)?.focus({ preventScroll: true })
  }

  // ---------- The latest changes ----------
  // A change names its category by the label it has now, else by the one the change recorded.
  type Fields = { label?: string; parent?: string | null; position?: number }
  const fieldsOf = (raw: string | null): Fields => { try { return raw ? JSON.parse(raw) : {} } catch { return {} } }
  const parentLabel = (parent: string | null | undefined) => parent ? nodeOf(parent)?.label ?? parent : top
  function described(change: CategoryChange) {
    const before = fieldsOf(change.before), after = fieldsOf(change.after)
    const name = nodeOf(change.name)?.label ?? after.label ?? before.label ?? change.name
    switch (change.kind) {
      case 'rename': return `${before.label ?? change.name} → ${after.label ?? change.name}`
      case 'move': return before.parent === after.parent ? `${name} · ${parentLabel(after.parent)}` : `${name} · ${parentLabel(before.parent)} → ${parentLabel(after.parent)}`
      case 'create': return after.parent ? `${name} · ${parentLabel(after.parent)}` : name
      default: return before.label ?? name
    }
  }
  // Only a category's latest change is undone; the list is newest first, so it is the first row naming it.
  const undoable = $derived(new Set(changes.filter((change, index) => changes.findIndex(other => other.name === change.name) === index).map(change => change.id)))
  async function undo(change: CategoryChange) {
    if (held || busy) return
    await save({ action: 'undo', id: change.id }, change.name)
  }
</script>

{#snippet chip(node: CategoryNode<Category>, parent: string | null, index: number, siblings: number, caption: boolean)}
  {@const into = !caption && node.level < GENRE_DEPTH_MAX ? keyOf(node.name) : undefined}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <span class="chip" class:caption class:held={held === node.name} class:dragging={dragging && held === node.name} class:saving={busy === node.name}
    class:target={into && targets.has(into)} class:over={into && over === into}
    data-chip data-before={keyOf(parent, index)} data-after={index + 1 < siblings ? keyOf(parent, index + 1) : keyOf(parent)} data-target={into} data-node={caption ? undefined : ''}
    onpointerdown={event => down(event, node.name)}>
    <button type="button" class="grip" data-grip={node.name} aria-label={t('categories.move', { name: node.label })} title={t('categories.move', { name: node.label })}
      aria-pressed={held === node.name} aria-disabled={Boolean(busy)} onclick={event => tap(event, node.name)} onkeydown={event => keys(event, node.name)}></button>
    {#if renaming === node.name}
      <input class="rename" value={node.label} maxlength={GENRE_LENGTH_MAX} autocomplete="off" aria-label={t('categories.rename', { name: node.label })}
        onkeydown={typed} onblur={event => rename(node, event.currentTarget.value)} use:focus />
    {:else}
      <button type="button" class="label" title={t('categories.rename', { name: node.label })}
        onclick={event => { if (held) return; event.stopPropagation(); startRename(node.name) }}>{node.label}</button>
    {/if}
    <span class="count">{node.n}</span>
    {#if !node.used && !node.children.length}
      <button type="button" class="remove" aria-label={t('categories.delete', { name: node.label })} title={t('categories.delete', { name: node.label })} disabled={Boolean(held || busy)}
        onclick={event => { event.stopPropagation(); remove(node) }}>×</button>
    {/if}
  </span>
{/snippet}

{#snippet adder(parent: string | null)}
  {#if adding === keyOf(parent)}
    <input class="adding" maxlength={GENRE_LENGTH_MAX} autocomplete="off" aria-label={t('categories.addUnder', { name: labelOf(parent) })}
      onkeydown={typed} onblur={event => add(parent, event.currentTarget.value)} use:focus />
  {:else}
    <button type="button" class="add" data-add={keyOf(parent)} aria-label={t('categories.addUnder', { name: labelOf(parent) })} title={t('categories.addUnder', { name: labelOf(parent) })}
      disabled={Boolean(held || busy)} onclick={event => { event.stopPropagation(); startAdd(parent) }}>+</button>
  {/if}
{/snippet}

{#snippet items(parent: string | null, list: CategoryNode<Category>[])}
  <div class="items">
    {#each list as node, index (node.name)}
      <div class="item" class:tray-item={node.level === 1 || node.children.length > 0} in:receive={{ key: node.name }} out:send={{ key: node.name }} animate:flip={slide}>
        <span class="gap" class:target={targets.has(keyOf(parent, index))} class:over={over === keyOf(parent, index)} data-target={keyOf(parent, index)} aria-hidden="true"></span>
        {#if node.level === 1 || node.children.length}{@render tray(node, parent, index, list.length)}{:else}{@render chip(node, parent, index, list.length, false)}{/if}
      </div>
    {/each}
    {@render adder(parent)}
  </div>
{/snippet}

{#snippet tray(node: CategoryNode<Category>, parent: string | null, index: number, siblings: number)}
  <section class="tray" class:nested={node.level > 1} class:held={held === node.name} class:dragging={dragging && held === node.name} class:saving={busy === node.name}
    class:target={targets.has(keyOf(node.name))} class:over={over === keyOf(node.name)} data-target={keyOf(node.name)} data-node aria-label={node.label}>
    <div class="caption">{@render chip(node, parent, index, siblings, true)}</div>
    {@render items(node.name, node.children)}
  </section>
{/snippet}

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="board" class:holding={held} class:dragging bind:this={board} onclick={clicked}>
  <section class="tray root" class:target={targets.has(keyOf(null))} class:over={over === keyOf(null)} data-target={keyOf(null)} aria-label={top}>
    <h2 class="caption">{top}</h2>
    {@render items(null, roots)}
  </section>
</div>
{#if error}<p class="notice bad" role="alert">{error}</p>{/if}
<p class="sr-only" aria-live="polite">{said}</p>
{#if changes.length}
  <section class="changes">
    <h2>{t('categories.changes')}</h2>
    <ol>
      {#each changes as change (change.id)}
        <li>
          <time datetime={change.at}>{when(change.at)}</time>
          <span class="who">{#if change.by_id}<a class="text-link" href={href(`/u/${change.by_id}`)}>{change.by_name}</a>{:else}—{/if}</span>
          <span class="kind">{t(`categories.change.${change.kind}`)}</span>
          <span class="what">{described(change)}</span>
          <span class="act">{#if undoable.has(change.id)}<button type="button" class="text-button" disabled={Boolean(held || busy)} onclick={() => undo(change)}>{t('categories.undo')}</button>{/if}</span>
        </li>
      {/each}
    </ol>
  </section>
{/if}

<style>
  .board { min-width: 0 }
  .board.dragging, .board.dragging :global(*) { cursor: grabbing }
  .tray { display: flex; flex-direction: column; gap: 10px; min-width: 0; padding: 10px 12px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface);
    transition: background-color .15s, outline-color .15s }
  .tray.root { padding: 14px; background: var(--paper); border-style: dashed }
  .tray.root > .caption { font-size: 13px; font-weight: 500; color: var(--muted) }
  .tray.nested { padding: 8px 10px 10px; background: var(--surface-sunken) }
  .items { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px; min-height: 36px }
  .tray.root > .items { gap: 12px }
  .item { position: relative; display: flex; max-width: 100% }
  .item.tray-item > .tray { flex: 1 1 auto }
  /* A gap takes no room: its hit area spans the space before the item, and shows a bar where it is aimed at. */
  .gap { position: absolute; inset-block: 0; inset-inline-start: -11px; width: 14px; z-index: 1; pointer-events: none }
  .holding .gap.target { pointer-events: auto; cursor: copy }
  .tray.root > .items > .item > .gap { inset-inline-start: -13px }
  .gap.over::after { content: ""; position: absolute; inset-block: 2px; inset-inline-start: 5px; width: 3px; border-radius: 2px; background: var(--accent) }
  .chip { display: inline-flex; align-items: center; gap: 2px; min-height: 36px; max-width: 100%; padding: 0 4px 0 0; border: 1px solid var(--line); border-radius: 8px; background: var(--surface);
    user-select: none; -webkit-user-select: none; transition: background-color .15s, outline-color .15s }
  .chip.caption { font-weight: 500 }
  .tray.nested .chip:not(.caption) { background: var(--surface) }
  .grip { flex: none; align-self: stretch; width: 22px; padding: 0; border: 0; border-radius: 7px 0 0 7px; background: transparent; cursor: grab; color: var(--muted) }
  .grip::before { content: ""; display: block; width: 6px; height: 12px; margin: auto; opacity: .7; background: radial-gradient(circle, currentColor 1px, transparent 1.3px) 0 0 / 3px 3px }
  .grip:hover { color: var(--accent) }
  .grip[aria-disabled="true"] { cursor: default }
  .label { min-height: 34px; padding: 0 6px; border: 0; border-radius: 5px; background: transparent; cursor: text; text-align: start; overflow-wrap: anywhere }
  .label:hover { color: var(--accent) }
  .rename, .adding { width: 10em; min-height: 30px; padding: 2px 8px; border: 1px solid var(--accent); border-radius: 6px; background: var(--surface); font-size: max(1rem, 1em) }
  .count { padding: 0 6px 0 2px; color: var(--muted); font-size: 13px; font-weight: 400; font-variant-numeric: tabular-nums }
  .remove { display: inline-grid; place-items: center; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 5px; background: transparent; color: var(--muted); font-size: 16px; line-height: 1; cursor: pointer }
  .remove:not(:disabled):hover { color: var(--wrong); background: var(--wrong-light) }
  .remove:disabled { opacity: .4; cursor: default }
  .add { display: inline-grid; place-items: center; width: 36px; height: 36px; padding: 0; border: 1px dashed var(--line-strong); border-radius: 8px; background: transparent; color: var(--muted); font-size: 18px; cursor: pointer }
  .add:not(:disabled):hover { color: var(--accent); border-color: var(--accent) }
  .add:disabled { opacity: .4; cursor: default }
  /* What is held is marked; the trays and chips that can take it are outlined; the one aimed at is filled. */
  .chip.held, .tray.held { outline: 2px solid var(--accent); outline-offset: 1px }
  .chip.held { background: var(--accent-light) }
  .dragging.chip, .dragging.tray { position: relative; z-index: 3; box-shadow: 0 10px 24px rgb(0 0 0 / 18%); pointer-events: none }
  .saving { opacity: .6 }
  .holding .tray.target, .holding .chip.target { outline: 2px dashed var(--accent); outline-offset: 2px; cursor: copy }
  .tray.over, .chip.over { outline-style: solid !important; background: var(--accent-light) }
  .notice { margin: 0 }
  .changes { display: flex; flex-direction: column; gap: 10px }
  .changes h2 { font-size: 15px }
  .changes ol { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--line) }
  .changes li { display: grid; grid-template-columns: 150px 140px 100px minmax(0, 1fr) auto; align-items: center; gap: 4px 12px; min-height: 40px; padding: 4px 0; border-bottom: 1px solid var(--line); font-size: 13px }
  .changes time, .changes .kind { color: var(--muted); font-variant-numeric: tabular-nums }
  .changes .who { overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
  .changes .what { overflow-wrap: anywhere }
  .changes .text-button { font-size: 13px }
  .changes .text-button:disabled { opacity: .5; cursor: default }
  @media (max-width: 700px) { .changes li { grid-template-columns: minmax(0, 1fr) auto } .changes .kind { grid-column: 1 } .changes .what { grid-column: 1 } .changes .act { grid-column: 2; grid-row: 2 / span 2 } }
  @media (max-width: 500px) { .tray { padding: 8px } .tray.root { padding: 10px } .item.tray-item { flex: 1 1 100% } }
  @media (prefers-reduced-motion: reduce) { .tray, .chip { transition: none } }
</style>
