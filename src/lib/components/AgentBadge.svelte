<script lang="ts">
  import { t } from '$lib/t'
  let { name, standalone = false }: { name: string; standalone?: boolean } = $props()
</script>

<span class="agent-badge" title={standalone ? t('agent.client') : t('agent.by', { agent: name })}>
  <span class="agent-kind">{t('agent.client')}</span>{#if !standalone}<span class="agent-model">{name}</span>{/if}
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
  .agent-kind {
    flex: 0 0 auto;
    padding: 1px 6px;
    background: var(--accent-light);
    color: var(--accent);
    font-weight: 500;
    white-space: nowrap;
  }
  .agent-model {
    min-width: 0;
    padding: 1px 6px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
