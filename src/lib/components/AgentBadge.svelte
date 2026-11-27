<script lang="ts">
  import { AGENT_UNKNOWN } from '$lib/agent'
  import { t } from '$lib/t'
  let { name: given, model = null, standalone = false, labeled = true }: { name: string; model?: string | null; standalone?: boolean; labeled?: boolean } = $props()
  const name = $derived(given === AGENT_UNKNOWN ? t('agent.unknown') : given)
  const title = $derived(model ? t('agent.byModel', { agent: name, model }) : standalone ? t('agent.client') : t('agent.by', { agent: name }))
</script>

<span class="agent-badge" {title}>
  {#if labeled}<span class="agent-kind">{t('agent.client')}</span>{/if}{#if !standalone}<span class="agent-name">{name}</span>{/if}{#if model}<span class="agent-model">{model}</span>{/if}
</span>

<style>
  .agent-badge {
    display: inline-flex;
    align-items: center;
    max-inline-size: 100%;
    min-width: 0;
    border: 1px solid var(--line);
    border-radius: 5px;
    background: var(--surface-sunken);
    color: var(--muted);
    font-size: 11px;
    line-height: 1.45;
    vertical-align: middle;
    overflow: hidden;
  }
  .agent-badge > span + span {
    border-inline-start: 1px solid var(--line);
  }
  .agent-kind {
    flex: 0 0 auto;
    padding: 1px 6px;
    background: var(--accent-light);
    color: var(--accent);
    font-weight: 500;
    white-space: nowrap;
  }
  .agent-name {
    flex: 0 1 auto;
    min-width: 0;
    padding: 1px 6px;
    background: var(--surface);
    color: var(--ink);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .agent-model {
    flex: 0 1 auto;
    min-width: 0;
    padding: 1px 6px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
