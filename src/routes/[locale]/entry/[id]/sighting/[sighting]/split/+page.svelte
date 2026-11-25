<script lang="ts">
  import { untrack } from 'svelte'
  import CharacterFields from '$lib/components/CharacterFields.svelte'
  import ScriptPicker from '$lib/components/ScriptPicker.svelte'
  import Seo from '$lib/components/Seo.svelte'
  import SightingCard from '$lib/components/SightingCard.svelte'
  import SubmitBar from '$lib/components/SubmitBar.svelte'
  import { primaryLayoutOf, valuesOf } from '$lib/claims'
  import { recordCode } from '$lib/code'
  import { href, t } from '$lib/t'
  let { data, form } = $props()
  const title = $derived(t('sighting.splitTitle', { id: recordCode(data.id) }))
  const only = $derived(data.only || form?.error === 'only')
  const descriptions = untrack(() => valuesOf(form?.values.claims ?? [], 'ids'))
  const layout = untrack(() => primaryLayoutOf(form?.values.claims ?? []))
  let primary = $state(descriptions[0] ?? '')
</script>

<Seo {title} />
<div class="page narrow stack">
  <a class="text-link back" href={href(`/entry/${data.id}#sighting-${data.sighting.id}`)}>← {t('history.back')}</a>
  <h1>{title}</h1>
  {#if only}<p class="notice bad" role="alert">{t('error.only')}</p>
  {:else if form?.error}<p class="notice bad" role="alert">{t(`error.${form.error}`)}</p>{/if}
  <SightingCard sighting={data.sighting} />
  {#if !only}
    <form method="POST" class="stack">
      <input type="hidden" name="rev" value={data.sighting.rev} />
      <section class="panel">
        <CharacterFields values={descriptions} {layout} bind:primary>
          <ScriptPicker value={form?.values.script ?? data.script} other={form?.values.script_other ?? data.script_other} />
        </CharacterFields>
      </section>
      <div class="field"><label for="summary">{t('sighting.removeReason')}</label><input id="summary" class="input" name="summary" maxlength="500" value={form?.summary ?? ''} /></div>
      {#if form?.error === 'conflict'}<button class="button" type="submit" disabled>{t('sighting.split')}</button>{:else}<SubmitBar label={t('sighting.split')} cancel={href(`/entry/${data.id}#sighting-${data.sighting.id}`)} />{/if}
    </form>
  {/if}
</div>

<style>
  .back { align-self:start; color:var(--muted) }
  .panel { padding:20px; border:1px solid var(--line); border-radius:10px; background:var(--surface) }
  @media(max-width:700px) { .panel { padding:16px } }
</style>
