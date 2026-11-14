<script lang="ts" module>
  // The tables ids-input ships, each read when a part is first looked up in it.
  import { babelStoneAdapter } from 'ids-input/adapter'
  import ids from 'ids-input/data/babelstone-ids.tsv.gz?url'
  import projectIds from 'ids-input/data/ids-project.tsv.gz?url'
  import overwriteIds from 'ids-input/data/ids-overwrites.tsv?url'
  import components from 'ids-input/data/ids-components.tsv?url'
  import parts from 'ids-input/data/ids-parts.json?url'
  import forms from 'ids-input/data/component-forms.tsv?url'
  import names from 'ids-input/data/component-names.tsv?url'
  import folds from 'ids-input/data/component-name-folds.tsv?url'
  import characterInfo from 'ids-input/data/character-info.json.gz?url'
  import characters from 'ids-input/data/character-vocabulary.tsv.gz?url'

  export const adapter = babelStoneAdapter({ ids, project: projectIds, overwrite: overwriteIds, components, parts, forms, names, folds, characters, characterInfo })
</script>

<script lang="ts">
  // The IDS Workshop's tools over the editor of a description's own field: the operators, the
  // description as a tree, the chosen part, and the pickers a part is taken from. They edit the text in
  // the field, so the drawing beside it follows each part as it is placed.
  import { IdsCharacterInfo, IdsOperators, IdsPartTools, IdsPicker, IdsTree, type IdsEditor } from 'ids-input/svelte'
  // ids-input loads a font shard for each rare character a panel shows; its entry point does not export the watcher.
  import { watchFallback } from '../../../node_modules/ids-input/src/svelte/fallback-font.js'

  let { editor, messages, locale = 'en' }: { editor: IdsEditor; messages?: Record<string, string>; locale?: string } = $props()
  let root = $state<HTMLElement | null>(null)
  let slot = $state<HTMLInputElement | null>(null)
  const say = $derived(editor.t)
  $effect(() => { if (root) return watchFallback(root) })
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="builder" bind:this={root} onkeydown={event => editor.keydown(event, { root, slot })}>
  <IdsOperators {editor} />
  <IdsTree {editor} />
  <IdsPartTools {editor} bind:slot status={false} />
  <IdsPicker {editor} recentKey="ug.recentParts" />
  <div class="history">
    <button type="button" class="button" disabled={!editor.canUndo} onclick={() => editor.undo()}>{say('ids.undo.label')}</button>
    <button type="button" class="button" disabled={!editor.canRedo} onclick={() => editor.redo()}>{say('ids.redo.label')}</button>
  </div>
</div>
<IdsCharacterInfo {root} {adapter} {messages} {locale} onpick={(part, path) => editor.take(part, path)} />

<style>
  .builder {
    display: flex; flex-direction: column; gap: 12px; min-width: 0;
    --ids-ink: var(--ink); --ids-ink-soft: var(--ink); --ids-muted: var(--muted); --ids-line: var(--line); --ids-line-strong: var(--line-strong);
    --ids-surface: var(--surface); --ids-surface-subtle: var(--surface-sunken); --ids-surface-selected: var(--surface-selected);
    --ids-accent: var(--accent); --ids-accent-light: var(--accent-light); --ids-focus: var(--focus-ring); --ids-fault: var(--wrong);
  }
  .builder :global(.ids-tree) { border: 1px solid var(--line); border-radius: 10px; background: var(--surface-sunken); min-height: 96px }
  /* The tree names a node by the way its parts run (`row`, `stack`), which are layout classes of this site too. */
  .builder :global(.ids-node:is(.row, .stack)) { flex-wrap: nowrap; align-items: stretch; gap: 0 }
  .history { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end }
  .history .button { min-height: 32px; padding: 4px 12px; font-size: 12.5px }
</style>
