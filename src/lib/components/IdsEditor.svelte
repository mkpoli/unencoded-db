<script lang="ts">
  // The IDS Workshop's editor, loaded when someone opens it. Its data are the files ids-input ships.
  import { IdsInput } from 'ids-input/svelte'
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

  let { value = $bindable(''), locale = 'en', messages, onuse }: { value?: string; locale?: string; messages?: Record<string, string>; onuse: (sequence: string) => void } = $props()
  const adapter = babelStoneAdapter({ ids, project: projectIds, overwrite: overwriteIds, components, parts, forms, names, folds, characters, characterInfo })
</script>

<IdsInput {adapter} bind:value {messages} {locale} {onuse} recentKey="ug.recentParts" />
