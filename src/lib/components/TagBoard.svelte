<script lang="ts">
  // Wiki board for the three tiers: types, the groups in each, and the tags, with their labels, places,
  // implications and undo history. A tag or a group is dragged by its grip to a new place.
  import {
    GROUP_LABEL_MAX,
    TAG_LENGTH_MAX,
    TAG_TYPES,
    arrangeTags,
    canImply,
    implicationClosure,
    sectionTags,
    tagErrorKey,
    tagLabels,
    tagLookup,
    type Tag,
    type TagGroup,
    type TagType,
  } from '$lib/tags'
  import type { TagChange } from '$lib/server/tags'
  import { href, t, when } from '$lib/t'

  let { tags = $bindable<Tag[]>([]), groups = $bindable<TagGroup[]>([]), changes = $bindable<TagChange[]>([]), ondone }: {
    tags: Tag[]
    groups: TagGroup[]
    changes: TagChange[]
    ondone?: () => void
  } = $props()

  let busy = $state(false)
  let errorMsg = $state<string | null>(null)
  let newName = $state('')
  let newPlace = $state<string>('general')
  let newImplies = $state('')
  let drafts = $state<Record<string, string>>({})
  let groupDrafts = $state<Record<number, string>>({})
  let aliasDrafts = $state<Record<string, string>>({})
  let newGroups = $state<Partial<Record<TagType, string>>>({})

  const byName = $derived(tagLookup(tags))
  const labels = $derived(tagLabels(tags))
  const groupById = $derived(new Map(groups.map(group => [group.id, group])))
  const sections = $derived(arrangeTags(tags, groups, { every: true }))

  // A place as a select's value: a type alone, or a group by its id.
  const placeValue = (type: TagType, group: number | null) => (group === null ? type : `g${group}`)
  const readPlace = (value: string): { type?: TagType; group: number | null } => value.startsWith('g') ? { group: Number(value.slice(1)) } : { type: value as TagType, group: null }

  // Which tags are implied by at least one other tag (so they cannot be deleted directly).
  const impliedBy = $derived.by(() => {
    const map = new Map<string, string[]>()
    for (const tag of tags) {
      for (const target of tag.implies) map.set(target, [...(map.get(target) ?? []), tag.name])
    }
    return map
  })

  // Only the latest undoable change of each tag or group offers Undo.
  const undoable = $derived.by(() => {
    const seen = new Set<string>()
    const latest = new Set<number>()
    for (const change of changes) {
      const key = `${change.subject}:${change.name}`
      if (seen.has(key)) continue
      seen.add(key)
      latest.add(change.id)
    }
    return latest
  })

  async function mutate(body: Record<string, unknown>, fallback: 'tag' | 'tagChange' = 'tagChange') {
    if (busy) return false
    busy = true
    errorMsg = null
    try {
      const response = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; tags?: Tag[]; groups?: TagGroup[]; changes?: TagChange[] } | null
      if (data?.tags) tags = data.tags
      if (data?.groups) groups = data.groups
      if (data?.changes) changes = data.changes
      if (!response.ok || !data?.ok) {
        errorMsg = t(tagErrorKey(data?.error, fallback))
        return false
      }
      return true
    } finally {
      busy = false
    }
  }

  async function createNew(event: Event) {
    event.preventDefault()
    const name = newName.trim()
    if (!name) return
    const place = readPlace(newPlace)
    const ok = await mutate({ action: 'create', name, ...place, implies: newImplies ? [newImplies] : [] }, 'tag')
    if (ok) {
      newName = ''
      newImplies = ''
    }
  }

  async function createGroup(event: Event, type: TagType) {
    event.preventDefault()
    const label = (newGroups[type] ?? '').trim()
    if (!label) return
    if (await mutate({ action: 'group.create', type, label })) newGroups = { ...newGroups, [type]: '' }
  }

  const without = <K extends string | number>(record: Record<K, string>, key: K) => {
    const rest = { ...record }
    delete rest[key]
    return rest
  }

  async function saveLabel(tag: Tag) {
    const next = (drafts[tag.name] ?? tag.label).trim()
    if (!next || next === tag.label) return void (drafts = without(drafts, tag.name))
    if (await mutate({ action: 'rename', name: tag.name, label: next, rev: tag.rev })) drafts = without(drafts, tag.name)
  }

  async function saveGroupLabel(group: TagGroup) {
    const next = (groupDrafts[group.id] ?? group.label).trim()
    if (!next || next === group.label) return void (groupDrafts = without(groupDrafts, group.id))
    if (await mutate({ action: 'group.rename', id: group.id, label: next, rev: group.rev })) groupDrafts = without(groupDrafts, group.id)
  }

  async function addAlias(event: Event, tag: Tag) {
    event.preventDefault()
    const alias = (aliasDrafts[tag.name] ?? '').trim()
    if (alias && await mutate({ action: 'alias', name: tag.name, alias, rev: tag.rev })) aliasDrafts = without(aliasDrafts, tag.name)
  }

  function merge(tag: Tag, target: string) {
    const into = byName.get(target)
    if (!into || !confirm(t('tags.mergeConfirm', { name: tag.label, target: into.label }))) return
    mutate({ action: 'merge', name: tag.name, into: into.name, rev: tag.rev, intoRev: into.rev })
  }

  const moveTag = (tag: Tag, place: { type?: TagType; group: number | null; index?: number }) => mutate({ action: 'move', name: tag.name, ...place, rev: tag.rev })
  const moveGroup = (group: TagGroup, place: { type: TagType; index: number }) => mutate({ action: 'group.move', id: group.id, ...place, rev: group.rev })

  // Dragging. A tag lands among the rows of the shelf under the pointer, before the first row whose middle
  // is below it; a group lands among the group cards of the type under the pointer the same way. The
  // dragged item keeps its place, dimmed, until it is let go.
  type Drag = { kind: 'tag'; tag: Tag } | { kind: 'group'; group: TagGroup }
  type Drop = { type: TagType; group: number | null; index: number }
  let drag = $state<Drag | null>(null)
  let drop = $state<Drop | null>(null)
  let ghost = $state({ x: 0, y: 0 })
  let board = $state<HTMLElement>()

  const middleAbove = (y: number) => (row: Element) => {
    const box = row.getBoundingClientRect()
    return box.top + box.height / 2 < y
  }

  function target(x: number, y: number, item: Drag): Drop | null {
    const under = document.elementFromPoint(x, y)
    if (!under || !board?.contains(under)) return null
    if (item.kind === 'tag') {
      // Over a group's heading, the group; anywhere else in a type, the tags of the type in no group.
      const shelf = under.closest<HTMLElement>('[data-shelf]')
        ?? under.closest('[data-group-card]')?.querySelector<HTMLElement>('[data-shelf]')
        ?? under.closest('[data-section]')?.querySelector<HTMLElement>(':scope > [data-shelf]')
      if (!shelf) return null
      const rows = [...shelf.querySelectorAll('[data-tag-row]')].filter(row => row.getAttribute('data-tag-row') !== item.tag.name)
      const group = shelf.dataset.group ? Number(shelf.dataset.group) : null
      return { type: shelf.dataset.type as TagType, group, index: rows.filter(middleAbove(y)).length }
    }
    const section = under.closest<HTMLElement>('[data-section]')
    if (!section) return null
    const cards = [...section.querySelectorAll('[data-group-card]')].filter(card => card.getAttribute('data-group-card') !== String(item.group.id))
    return { type: section.dataset.section as TagType, group: null, index: cards.filter(middleAbove(y)).length }
  }

  function startDrag(event: PointerEvent, item: Drag) {
    if (event.button !== 0 || drag || busy) return
    event.preventDefault()
    let x = event.clientX, y = event.clientY, frame = 0, moved = false
    drag = item
    ghost = { x, y }
    const scroll = () => {
      const edge = 72
      const past = y < edge ? y - edge : y > innerHeight - edge ? y - (innerHeight - edge) : 0
      if (past && moved) {
        scrollBy({ top: past / 4, behavior: 'instant' })
        drop = target(x, y, item)
      }
      frame = requestAnimationFrame(scroll)
    }
    const stop = () => {
      cancelAnimationFrame(frame)
      for (const [name, listener] of listeners) removeEventListener(name, listener as EventListener)
      drag = null
      drop = null
    }
    const move = (now: PointerEvent) => {
      if (now.pointerId !== event.pointerId) return
      if (now.pointerType === 'mouse' && !now.buttons) return stop()
      if (Math.hypot(now.clientX - event.clientX, now.clientY - event.clientY) > 4) moved = true
      x = now.clientX
      y = now.clientY
      ghost = { x, y }
      if (moved) drop = target(x, y, item)
    }
    const end = (now: PointerEvent | KeyboardEvent) => {
      if (now instanceof KeyboardEvent ? now.key !== 'Escape' : now.pointerId !== event.pointerId) return
      const landing = now.type === 'pointerup' && moved ? drop : null
      stop()
      if (!landing) return
      if (item.kind === 'tag') moveTag(item.tag, landing.group === null ? { type: landing.type, group: null, index: landing.index } : { group: landing.group, index: landing.index })
      else moveGroup(item.group, { type: landing.type, index: landing.index })
    }
    const listeners = [['pointermove', move], ['pointerup', end], ['pointercancel', end], ['keydown', end]] as const
    for (const [name, listener] of listeners) addEventListener(name, listener as EventListener)
    frame = requestAnimationFrame(scroll)
  }

  // The arrow keys move a focused grip's item up or down among its neighbours.
  function gripKey(event: KeyboardEvent, step: (by: number) => void) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    step(event.key === 'ArrowUp' ? -1 : 1)
  }

  const dropsHere = (type: TagType, group: number | null, index: number) => drag?.kind === 'tag' && drop?.type === type && drop.group === group && drop.index === index
  const groupDropsHere = (type: TagType, index: number) => drag?.kind === 'group' && drop?.type === type && drop.index === index

  function parse(raw: string | null) {
    try { return raw ? JSON.parse(raw) as Record<string, unknown> : null } catch { return null }
  }
  const placeName = (place: Record<string, unknown> | null) => {
    if (!place) return ''
    const group = typeof place.group === 'number' ? groupById.get(place.group) : null
    const type = t(`tagType.${String(place.type ?? group?.type ?? 'general')}`)
    return group ? `${type} › ${group.label}` : type
  }
  function changeName(change: TagChange) {
    // A name that is now an alias is shown as written; the label of the tag it points to would hide what changed.
    if (change.subject === 'tag') return tags.some(tag => tag.name === change.name) ? labels.get(change.name) ?? change.name : change.name
    const known = groupById.get(Number(change.name))
    return known?.label ?? String(parse(change.before)?.label ?? parse(change.after)?.label ?? change.name)
  }
  function changeDetail(change: TagChange) {
    const before = parse(change.before), after = parse(change.after)
    if (change.kind === 'rename' && before?.label && after?.label) return `${String(before.label)} → ${String(after.label)}`
    if (change.kind === 'retype' && before?.type && after?.type) {
      return `${t(`tagType.${String(before.type)}`)} → ${t(`tagType.${String(after.type)}`)}`
    }
    if (change.kind === 'move' && before && after) {
      const from = placeName(before), to = placeName(after)
      return from === to ? `${from} ${Number(before.index) + 1} → ${Number(after.index) + 1}` : `${from} → ${to}`
    }
    if (change.kind === 'imply' && after?.implies) {
      const target = String(after.implies)
      return `→ ${labels.get(target) ?? target}`
    }
    if (change.kind === 'unimply' && before?.implies) {
      const target = String(before.implies)
      return `× ${labels.get(target) ?? target}`
    }
    if (change.kind === 'merge' && after?.into) return `→ ${labels.get(String(after.into)) ?? String(after.into)}`
    if (change.kind === 'split' && before?.tag) return `← ${labels.get(String(before.tag)) ?? String(before.tag)}`
    if (change.kind === 'alias' && after?.tag) return `= ${labels.get(String(after.tag)) ?? String(after.tag)}`
    if (change.kind === 'unalias' && before?.tag) return `≠ ${labels.get(String(before.tag)) ?? String(before.tag)}`
    if (change.kind === 'create' && after?.type) return placeName(after)
    return ''
  }
</script>

{#snippet grip(label: string, onpointerdown: (event: PointerEvent) => void, onkeydown: (event: KeyboardEvent) => void)}
  <button type="button" class="grip" aria-label={label} title={label} {onpointerdown} {onkeydown}><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg></button>
{/snippet}

{#snippet tagRow(tag: Tag, index: number, shelfTags: Tag[])}
  {@const currentLabel = drafts[tag.name] ?? tag.label}
  {@const dirty = currentLabel.trim() !== tag.label && currentLabel.trim().length > 0}
  {@const closure = implicationClosure([tag.name], tags)}
  {@const candidates = tags.filter(other => canImply(tags, tag.name, other.name) === null)}
  {@const parents = impliedBy.get(tag.name) ?? []}
  {@const locked = Boolean(tag.used || parents.length)}
  <div class="tag-row" class:dragged={drag?.kind === 'tag' && drag.tag.name === tag.name} data-tag-row={tag.name}>
    <div class="row-main">
      <div class="identity">
        {@render grip(t('tags.drag', { name: tag.label }), event => startDrag(event, { kind: 'tag', tag }), event => gripKey(event, by => {
          const index2 = index + by
          if (index2 >= 0 && index2 < shelfTags.length) moveTag(tag, tag.group === null ? { type: tag.type, group: null, index: index2 } : { group: tag.group, index: index2 })
        }))}
        <span class="tag-chip" data-tag-type={tag.type}>{tag.label}</span>
        {#if tag.label !== tag.name}<code class="slug">{tag.name}</code>{/if}
        <a class="n" href={href(`/?tag=${encodeURIComponent(tag.name)}`)}>{tag.n}</a>
      </div>

      <div class="controls">
        <input
          class="input label-input"
          type="text"
          maxlength={TAG_LENGTH_MAX}
          aria-label={t('tags.rename', { name: tag.label })}
          value={currentLabel}
          oninput={event => (drafts = { ...drafts, [tag.name]: event.currentTarget.value })}
          onkeydown={event => { if (event.key === 'Enter') { event.preventDefault(); saveLabel(tag) } }}
        />
        {#if dirty}
          <button type="button" class="button" disabled={busy} onclick={() => saveLabel(tag)}>{t('tags.save')}</button>
        {/if}
        <select
          class="input type-select"
          aria-label={t('tags.moveTo', { name: tag.label })}
          value={placeValue(tag.type, tag.group)}
          disabled={busy}
          onchange={event => moveTag(tag, readPlace(event.currentTarget.value))}
        >
          {#each sections as section (section.type)}
            <optgroup label={t(`tagType.${section.type}`)}>
              <option value={section.type}>{t(`tagType.${section.type}`)}</option>
              {#each section.shelves as shelf (shelf.group?.id ?? 0)}
                {#if shelf.group}<option value={placeValue(section.type, shelf.group.id)}>{t(`tagType.${section.type}`)} › {shelf.group.label}</option>{/if}
              {/each}
            </optgroup>
          {/each}
        </select>
        <select
          class="input type-select"
          aria-label={t('tags.mergeInto', { name: tag.label })}
          disabled={busy}
          value=""
          onchange={event => {
            const target = event.currentTarget.value
            event.currentTarget.value = ''
            if (target) merge(tag, target)
          }}
        >
          <option value="">{t('tags.merge')}</option>
          {#each sections as mSection (mSection.type)}
            {#if sectionTags(mSection).some(other => other.name !== tag.name)}
              <optgroup label={t(`tagType.${mSection.type}`)}>
                {#each sectionTags(mSection).filter(other => other.name !== tag.name) as other (other.name)}
                  <option value={other.name}>{other.label}</option>
                {/each}
              </optgroup>
            {/if}
          {/each}
        </select>
        <button
          type="button"
          class="button danger"
          disabled={locked || busy}
          title={locked ? t('tags.inUse') : t('tags.delete', { name: tag.label })}
          aria-label={t('tags.delete', { name: tag.label })}
          onclick={() => mutate({ action: 'delete', name: tag.name, rev: tag.rev })}
        >×</button>
      </div>
    </div>

    <form class="implications" onsubmit={event => addAlias(event, tag)}>
      <span class="imp-label">{t('tags.aliases')}</span>
      {#each tag.aliases as alias (alias)}
        <span class="alias">
          {alias}
          <button type="button" class="x" disabled={busy} aria-label={t('tags.unalias', { alias })} onclick={() => mutate({ action: 'unalias', alias })}>×</button>
        </span>
      {/each}
      <input
        class="input alias-input"
        type="text"
        maxlength={TAG_LENGTH_MAX}
        placeholder="+ {t('tags.alias')}"
        aria-label={t('tags.addAlias', { name: tag.label })}
        value={aliasDrafts[tag.name] ?? ''}
        oninput={event => (aliasDrafts = { ...aliasDrafts, [tag.name]: event.currentTarget.value })}
      />
      {#if (aliasDrafts[tag.name] ?? '').trim()}
        <button class="button" type="submit" disabled={busy}>{t('tags.add')}</button>
      {/if}
    </form>

    <div class="implications">
      <span class="imp-label">{t('tags.carries')}</span>
      {#each tag.implies as target (target)}
        {@const targetTag = byName.get(target)}
        <span class="tag-chip" data-tag-type={targetTag?.type ?? 'general'}>
          {targetTag?.label ?? target}
          <button
            type="button"
            class="x"
            disabled={busy}
            aria-label={t('tags.unimply', { name: tag.label, target: targetTag?.label ?? target })}
            onclick={() => mutate({ action: 'unimply', name: tag.name, target, rev: tag.rev })}
          >×</button>
        </span>
      {/each}
      {#each closure.implied.filter(item => !tag.implies.includes(item.name)) as indirect (indirect.name)}
        {@const indirectTag = byName.get(indirect.name)}
        <span class="tag-chip implied" data-tag-type={indirectTag?.type ?? 'general'} title={t('tags.carriedBy', { via: indirect.via.map(v => labels.get(v) ?? v).join(', ') })}>
          {indirectTag?.label ?? indirect.name}
        </span>
      {/each}
      {#if candidates.length}
        <select
          class="input add-imp"
          aria-label={t('tags.addImply', { name: tag.label })}
          disabled={busy}
          value=""
          onchange={event => {
            const target = event.currentTarget.value
            event.currentTarget.value = ''
            if (target) mutate({ action: 'imply', name: tag.name, target, rev: tag.rev })
          }}
        >
          <option value="">+ {t('tags.imply')}</option>
          {#each arrangeTags(candidates, groups) as cSection (cSection.type)}
            <optgroup label={t(`tagType.${cSection.type}`)}>
              {#each sectionTags(cSection) as candidate (candidate.name)}
                <option value={candidate.name}>{candidate.label}</option>
              {/each}
            </optgroup>
          {/each}
        </select>
      {/if}
    </div>
  </div>
{/snippet}

{#snippet shelfRows(type: TagType, group: number | null, shelfTags: Tag[])}
  {@const staying = shelfTags.filter(tag => !(drag?.kind === 'tag' && drag.tag.name === tag.name))}
  <div class="rows" data-shelf data-type={type} data-group={group ?? ''}>
    {#each shelfTags as tag, index (tag.name)}
      {@const at = staying.indexOf(tag)}
      {#if at >= 0 && dropsHere(type, group, at)}<div class="drop-line" aria-hidden="true"></div>{/if}
      {@render tagRow(tag, index, shelfTags)}
    {/each}
    {#if dropsHere(type, group, staying.length)}<div class="drop-line" aria-hidden="true"></div>{/if}
    {#if !shelfTags.length}<div class="empty-shelf" aria-hidden="true"></div>{/if}
  </div>
{/snippet}

<div class="board" class:sorting={drag !== null} bind:this={board}>
  <div class="board-head">
    <form class="create-bar" onsubmit={createNew}>
      <input
        class="input"
        type="text"
        maxlength={TAG_LENGTH_MAX}
        placeholder={t('field.tagAdd')}
        aria-label={t('field.tagAdd')}
        bind:value={newName}
      />
      <select class="input" aria-label={t('field.tagPlace')} bind:value={newPlace}>
        {#each sections as section (section.type)}
          <optgroup label={t(`tagType.${section.type}`)}>
            <option value={section.type}>{t(`tagType.${section.type}`)}</option>
            {#each section.shelves as shelf (shelf.group?.id ?? 0)}
              {#if shelf.group}<option value={placeValue(section.type, shelf.group.id)}>{t(`tagType.${section.type}`)} › {shelf.group.label}</option>{/if}
            {/each}
          </optgroup>
        {/each}
      </select>
      <select class="input" aria-label={t('field.tagImplies')} bind:value={newImplies}>
        <option value="">{t('field.tagImpliesNone')}</option>
        {#each sections as section (section.type)}
          {#if sectionTags(section).length}
            <optgroup label={t(`tagType.${section.type}`)}>
              {#each sectionTags(section) as item (item.name)}
                <option value={item.name}>{item.label}</option>
              {/each}
            </optgroup>
          {/if}
        {/each}
      </select>
      <button class="button primary" type="submit" disabled={busy || !newName.trim()}>{t('tags.add')}</button>
    </form>
    {#if ondone}
      <button class="button" type="button" onclick={ondone}>{t('tags.done')}</button>
    {/if}
  </div>

  {#if errorMsg}
    <p class="banner-error" role="alert">{errorMsg}</p>
  {/if}

  {#each sections as section (section.type)}
    {@const sectionGroups = section.shelves.filter(shelf => shelf.group)}
    {@const stayingGroups = sectionGroups.filter(shelf => !(drag?.kind === 'group' && drag.group.id === shelf.group!.id))}
    {@const loose = section.shelves.find(shelf => !shelf.group)!}
    <section class="type-section" data-section={section.type}>
      <h2>
        <span class="tag-chip" data-tag-type={section.type}>{t(`tagType.${section.type}`)}</span>
        <span class="muted count">({sectionTags(section).length})</span>
      </h2>

      {#each sectionGroups as shelf, groupIndex (shelf.group!.id)}
        {@const group = shelf.group!}
        {@const at = stayingGroups.indexOf(shelf)}
        {@const currentLabel = groupDrafts[group.id] ?? group.label}
        {@const dirty = currentLabel.trim() !== group.label && currentLabel.trim().length > 0}
        {#if at >= 0 && groupDropsHere(section.type, at)}<div class="drop-line wide" aria-hidden="true"></div>{/if}
        <div class="group-card" class:dragged={drag?.kind === 'group' && drag.group.id === group.id} data-group-card={group.id}>
          <div class="group-head">
            {@render grip(t('tags.drag', { name: group.label }), event => startDrag(event, { kind: 'group', group }), event => gripKey(event, by => {
              const index2 = groupIndex + by
              if (index2 >= 0 && index2 < sectionGroups.length) moveGroup(group, { type: section.type, index: index2 })
            }))}
            <input
              class="input group-label"
              type="text"
              maxlength={GROUP_LABEL_MAX}
              aria-label={t('tags.renameGroup', { name: group.label })}
              value={currentLabel}
              oninput={event => (groupDrafts = { ...groupDrafts, [group.id]: event.currentTarget.value })}
              onkeydown={event => { if (event.key === 'Enter') { event.preventDefault(); saveGroupLabel(group) } }}
            />
            {#if dirty}
              <button type="button" class="button" disabled={busy} onclick={() => saveGroupLabel(group)}>{t('tags.save')}</button>
            {/if}
            <span class="muted count">({shelf.tags.length})</span>
            <button
              type="button"
              class="button danger"
              disabled={shelf.tags.length > 0 || busy}
              title={shelf.tags.length ? t('tags.groupInUse') : t('tags.deleteGroup', { name: group.label })}
              aria-label={t('tags.deleteGroup', { name: group.label })}
              onclick={() => mutate({ action: 'group.delete', id: group.id, rev: group.rev })}
            >×</button>
          </div>
          {@render shelfRows(section.type, group.id, shelf.tags)}
        </div>
      {/each}
      {#if groupDropsHere(section.type, stayingGroups.length)}<div class="drop-line wide" aria-hidden="true"></div>{/if}

      {@render shelfRows(section.type, null, loose.tags)}

      <form class="group-add" onsubmit={event => createGroup(event, section.type)}>
        <input
          class="input"
          type="text"
          maxlength={GROUP_LABEL_MAX}
          placeholder={t('tags.addGroup')}
          aria-label={t('tags.addGroupTo', { type: t(`tagType.${section.type}`) })}
          value={newGroups[section.type] ?? ''}
          oninput={event => (newGroups = { ...newGroups, [section.type]: event.currentTarget.value })}
        />
        <button class="button" type="submit" disabled={busy || !(newGroups[section.type] ?? '').trim()}>{t('tags.add')}</button>
      </form>
    </section>
  {/each}

  {#if changes.length}
    <section class="changes">
      <h2>{t('tags.changes')}</h2>
      <ul>
        {#each changes as change (change.id)}
          {@const detail = changeDetail(change)}
          <li>
            <span class="kind">{t(`tags.${change.subject === 'group' ? 'groupChange' : 'change'}.${change.kind}`)}</span>
            <strong>{changeName(change)}</strong>
            {#if detail}<span class="detail">{detail}</span>{/if}
            <span class="meta">
              {#if change.by_id}<a href={href(`/u/${change.by_id}`)}>{change.by_name ?? change.by_id}</a>{/if}
              · {when(change.at)}
            </span>
            {#if undoable.has(change.id)}
              <button type="button" class="text-button" disabled={busy} onclick={() => mutate({ action: 'undo', id: change.id })}>
                {t('tags.undo')}
              </button>
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if drag}
    <div class="ghost" style:left="{ghost.x}px" style:top="{ghost.y}px" aria-hidden="true">
      {#if drag.kind === 'tag'}<span class="tag-chip" data-tag-type={drag.tag.type}>{drag.tag.label}</span>{:else}<span class="ghost-group">{drag.group.label}</span>{/if}
    </div>
  {/if}
</div>

<style>
  .board { display: grid; grid-template-columns: minmax(0, 1fr); gap: 22px }
  .board.sorting { cursor: grabbing; user-select: none }
  .board-head { display: flex; flex-wrap: wrap; gap: 10px; justify-content: space-between; align-items: center }
  .create-bar { display: flex; flex-wrap: wrap; gap: 8px; flex: 1 1 260px; min-inline-size: 0 }
  .create-bar .input { flex: 1 1 140px; inline-size: auto; min-inline-size: 0 }
  .banner-error { margin: 0; padding: 10px 12px; border: 1px solid var(--wrong); border-radius: 7px; background: var(--wrong-light); color: var(--wrong); font-size: 14px }
  .type-section { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px }
  .type-section h2 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 15px }
  .count { font-size: 13px; color: var(--muted); font-weight: 400 }
  .group-card { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; padding: 10px; border: 1px solid var(--line-strong); border-radius: 9px; background: var(--surface-sunken) }
  .group-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px }
  .group-label { inline-size: min(220px, 100%); padding: 5px 8px; font-weight: 600 }
  .rows { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; min-block-size: 8px }
  .empty-shelf { block-size: 36px; border: 1px dashed var(--line); border-radius: 8px }
  .tag-row { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface) }
  .tag-row.dragged, .group-card.dragged { opacity: 0.45 }
  .drop-line { block-size: 3px; border-radius: 2px; background: var(--accent) }
  .row-main { display: flex; flex-wrap: wrap; gap: 10px; justify-content: space-between; align-items: center }
  .identity { display: flex; flex-wrap: wrap; min-inline-size: 0; align-items: center; gap: 8px }
  .grip { display: inline-grid; place-items: center; flex: none; inline-size: 28px; block-size: 28px; padding: 0; border: 0; border-radius: 6px; background: none; color: var(--muted); cursor: grab; touch-action: none }
  .grip:hover, .grip:focus-visible { color: var(--ink); background: var(--surface-sunken) }
  .slug { font-size: 12px; color: var(--muted) }
  .n { font-size: 12.5px; color: var(--muted); font-variant-numeric: tabular-nums }
  .controls { display: flex; flex-wrap: wrap; gap: 6px; align-items: center }
  .label-input { inline-size: min(150px, 100%); padding: 5px 8px }
  .type-select { inline-size: auto; max-inline-size: 100%; padding: 5px 8px }
  .implications { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12.5px }
  .imp-label { color: var(--muted) }
  .x { appearance: none; border: 0; background: none; color: inherit; cursor: pointer; padding: 0 2px; font-size: 14px; line-height: 1 }
  .alias { display: inline-flex; align-items: center; gap: 2px; padding: 1px 8px; border: 1px dashed var(--line-strong); border-radius: 999px; color: var(--muted) }
  .alias-input { inline-size: 9rem; min-height: 28px; padding: 2px 8px; font-size: 12.5px }
  .add-imp { width: auto; min-height: 28px; padding: 2px 8px; font-size: 12.5px }
  .group-add { display: flex; flex-wrap: wrap; gap: 6px }
  .group-add .input { flex: 0 1 220px; inline-size: auto; min-inline-size: 0; padding: 5px 8px }
  .ghost { position: fixed; z-index: 30; pointer-events: none; transform: translate(12px, -50%) }
  .ghost-group { display: inline-block; padding: 4px 10px; border: 1px solid var(--line-strong); border-radius: 7px; background: var(--surface); font-weight: 600; box-shadow: 0 4px 14px rgb(0 0 0 / 0.14) }
  .changes { display: grid; gap: 8px; padding-top: 8px; border-top: 1px solid var(--line) }
  .changes h2 { margin: 0; font-size: 15px }
  .changes ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px }
  .changes li { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; font-size: 13px }
  .kind { color: var(--muted); min-width: 72px }
  .detail { color: var(--muted) }
  .meta { color: var(--muted); margin-inline-start: auto }
</style>
