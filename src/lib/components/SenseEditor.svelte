<script lang="ts">
  // The meanings, readings and related characters of one form, on a page that draws them together.
  // The draft lives here so the two lists share their keys and choices; a page that places the
  // related characters elsewhere keeps its own draft and draws SenseFields and RelationFields itself.
  import { onMount, untrack } from 'svelte'
  import type { Claim } from '$lib/claims'
  import type { CharacterFacts } from '$lib/character-tables'
  import { createSenseDraft } from '$lib/sense-draft.svelte'
  import type { Choice } from './ChoiceGroup.svelte'
  import RelationFields from './RelationFields.svelte'
  import SenseFields from './SenseFields.svelte'

  let { claims = [], evidence = [], fill = null }: { claims?: Claim[]; evidence?: Choice[]; fill?: CharacterFacts | null } = $props()
  const senses = createSenseDraft({ claims: untrack(() => claims), evidence: untrack(() => evidence) })
  onMount(() => senses.start())
  $effect(() => {
    if (fill) senses.applyFill(fill)
  })
</script>

<div class="senses">
  <SenseFields {senses} {evidence} />
  <RelationFields {senses} {evidence} />
</div>

<style>
  .senses { display: flex; flex-direction: column; gap: 24px; min-width: 0 }
</style>
