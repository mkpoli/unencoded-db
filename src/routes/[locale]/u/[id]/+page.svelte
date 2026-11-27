<script lang="ts">
  import AgentBadge from '$lib/components/AgentBadge.svelte'
  import HistoryList from '$lib/components/HistoryList.svelte'
  import Seo from '$lib/components/Seo.svelte'
  import { day, href, t } from '$lib/t'
  let { data, form } = $props()
</script>

<Seo title={t('person.title', { name: data.person.name })} />
<div class="page narrow stack">
  <div class="stack intro">
    <h1>{t('person.title', { name: data.person.name })}</h1>
    <p class="muted small">{t('person.since', { date: day(data.person.created_at) })}</p>
    {#if data.agents.length}
      <div class="agents">
        <span class="muted small">{t('person.agents')}</span>
        <ul class="agent-list">
          {#each data.agents as agent (`${agent.name}\u0000${agent.model ?? ''}`)}<li><AgentBadge name={agent.name} model={agent.model} labeled={false} /></li>{/each}
        </ul>
      </div>
    {/if}
  </div>
  {#if data.mergeable}
    <form class="merge" method="POST" action="?/merge">
      <div class="field">
        <label for="merge-into">{t('person.mergeInto')}</label>
        <input id="merge-into" class="input" name="into" required autocomplete="off" value={form?.into ?? ''} />
      </div>
      <div class="grid-2">
        <div class="field">
          <label for="merge-agent">{t('person.mergeAgent')}</label>
          <input id="merge-agent" class="input" name="agent" maxlength="80" autocomplete="off" placeholder={t('person.mergeAgentPlaceholder')} value={form?.agent ?? ''} />
        </div>
        <div class="field">
          <label for="merge-model">{t('person.mergeModel')}</label>
          <input id="merge-model" class="input" name="model" maxlength="80" autocomplete="off" placeholder={t('person.mergeModelPlaceholder')} value={form?.model ?? ''} />
        </div>
      </div>
      <div class="row">
        {#if form && 'target' in form && form.target}
          <input type="hidden" name="confirm" value={form.target.id} />
          <input type="hidden" name="confirm_agent" value={form.agent ?? ''} />
          <input type="hidden" name="confirm_model" value={form.model ?? ''} />
          <button class="button danger">{t('person.mergeConfirm', { name: form.target.name })}</button>
        {:else}
          <button class="button">{t('person.merge')}</button>
        {/if}
      </div>
      {#if form && 'target' in form && form.target}
        <p class="small muted preview">
          <span><a class="text-link" href={href(`/u/${form.target.id}`)}>{form.target.name}</a> · {t(form.target.changes === 1 ? 'people.change' : 'people.changes', { n: form.target.changes })}</span>
          {#if form.agent}<AgentBadge name={form.agent} model={form.model || null} />{/if}
        </p>
      {/if}
      {#if form && 'merge' in form && form.merge}<p class="notice bad" role="alert">{t(({ missing: 'person.mergeMissing', self: 'person.mergeSelf', banned: 'person.mergeBanned', agent: 'person.mergeAgentInvalid', model: 'person.mergeModelInvalid' } as const)[form.merge])}</p>{/if}
    </form>
  {/if}
  <HistoryList dates={data.dates} rows={data.rows} tags={data.tags} showEntry showActor={false} empty={t('person.empty')} next={data.next} />
</div>

<style>
  .intro { gap: 4px }
  .agents { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; margin-top: 4px }
  .agent-list { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none }
  .merge { display: grid; gap: 10px; max-width: 560px }
  .merge .row { display: flex; gap: 8px }
  .preview { display: flex; flex-wrap: wrap; align-items: center; gap: 6px }
</style>
