<script lang="ts">
  import { onDestroy, tick } from 'svelte'
  import Seo from '$lib/components/Seo.svelte'
  import {
    ANTIGRAVITY_AUTH_PATH,
    CHATGPT_MCP_DOCS,
    CLAUDE_CODE_AUTH_PATH,
    CLAUDE_CONNECTOR_DOCS,
    CODEX_LOGIN_COMMAND,
    MCP_CLIENT_IDS,
    type McpClientId,
    antigravityCommand,
    claudeCodeCommand,
    codexCommand,
    cursorConfig,
    cursorInstallUrl,
    genericConfig,
    vscodeConfig,
    vscodeInstallUrl,
  } from '$lib/mcp-setup'
  import { t } from '$lib/t'

  let { data } = $props()

  const endpoint = $derived(data.endpoint)

  let client = $state<McpClientId>('claude-code')
  let tabButtons: Partial<Record<McpClientId, HTMLButtonElement | null>> = {}

  let copiedKey = $state<string | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined
  onDestroy(() => clearTimeout(timer))

  function selectClient(id: McpClientId) {
    client = id
    if (copiedKey && copiedKey !== 'endpoint') copiedKey = null
  }

  async function copy(key: string, value: string, target?: HTMLElement | null) {
    try {
      await navigator.clipboard.writeText(value)
      copiedKey = key
      clearTimeout(timer)
      timer = setTimeout(() => { if (copiedKey === key) copiedKey = null }, 1800)
    } catch {
      if (!target) return
      const range = document.createRange()
      range.selectNodeContents(target)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    }
  }

  let endpointEl = $state<HTMLElement>()
  let commandEl = $state<HTMLElement>()
  let authCommandEl = $state<HTMLElement>()
  let configEl = $state<HTMLElement>()

  const clientLabel = (id: McpClientId) => {
    switch (id) {
      case 'claude-code': return 'Claude Code'
      case 'codex': return 'Codex'
      case 'antigravity': return 'Antigravity CLI'
      case 'cursor': return 'Cursor'
      case 'vscode': return 'VS Code'
      case 'claude': return 'Claude'
      case 'chatgpt': return 'ChatGPT'
      case 'json': return t('mcp.client.json')
    }
  }

  async function onTabKeydown(event: KeyboardEvent, index: number) {
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % MCP_CLIENT_IDS.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + MCP_CLIENT_IDS.length) % MCP_CLIENT_IDS.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = MCP_CLIENT_IDS.length - 1
    else return
    event.preventDefault()
    const id = MCP_CLIENT_IDS[next]
    selectClient(id)
    await tick()
    tabButtons[id]?.focus()
  }

  const commandText = $derived(
    client === 'claude-code' ? claudeCodeCommand(endpoint)
      : client === 'codex' ? codexCommand(endpoint)
      : client === 'antigravity' ? antigravityCommand(endpoint)
      : '',
  )
  const configText = $derived(
    client === 'cursor' ? cursorConfig(endpoint)
      : client === 'vscode' ? vscodeConfig(endpoint)
      : client === 'json' ? genericConfig(endpoint)
      : '',
  )
  const configFile = $derived(
    client === 'cursor' ? '.cursor/mcp.json'
      : client === 'vscode' ? '.vscode/mcp.json'
      : 'mcp.json',
  )
  const cmdKey = $derived(`cmd:${client}`)
  const authKey = $derived(`auth:${client}`)
  const cfgKey = $derived(`cfg:${client}`)
</script>

{#snippet copyIcon(done: boolean)}
  {#if done}
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
  {:else}
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/></svg>
  {/if}
{/snippet}

<Seo title={t('mcp.title')} description={t('mcp.intro')} />
<div class="page narrow stack mcp-page">
  <header class="stack head">
    <h1>{t('mcp.title')}</h1>
    <p class="intro">{t('mcp.intro')}</p>
  </header>

  <section class="endpoint-card" aria-labelledby="mcp-endpoint-label">
    <div class="endpoint-meta">
      <span class="kind">MCP</span>
      <span id="mcp-endpoint-label" class="endpoint-label">{t('mcp.endpoint')}</span>
    </div>
    <div class="code-line">
      <code class="mono" bind:this={endpointEl}>{endpoint}</code>
      <button
        type="button"
        class="button primary copy-btn"
        class:copied={copiedKey === 'endpoint'}
        onclick={() => copy('endpoint', endpoint, endpointEl)}
      >
        {@render copyIcon(copiedKey === 'endpoint')}
        <span>{copiedKey === 'endpoint' ? t('entry.copied') : t('entry.copy')}</span>
      </button>
    </div>
  </section>

  <dl class="facts">
    <div><dt>{t('mcp.transport')}</dt><dd>Streamable HTTP</dd></div>
    <div><dt>{t('mcp.auth')}</dt><dd>{t('mcp.authOptional')}</dd></div>
    <div><dt>{t('data.licenseTitle')}</dt><dd><a class="text-link" href="https://creativecommons.org/licenses/by-sa/4.0/" rel="license noopener" target="_blank">CC BY-SA 4.0</a></dd></div>
  </dl>

  <section class="stack setup-section" aria-labelledby="mcp-setup-heading">
    <h2 id="mcp-setup-heading">{t('mcp.setupTitle')}</h2>
    <div class="tabs" role="tablist" aria-label={t('mcp.clients')}>
      {#each MCP_CLIENT_IDS as id, index (id)}
        <button
          type="button"
          role="tab"
          id="mcp-tab-{id}"
          class="tab"
          class:on={client === id}
          aria-selected={client === id}
          aria-controls="mcp-panel"
          tabindex={client === id ? 0 : -1}
          bind:this={tabButtons[id]}
          onclick={() => selectClient(id)}
          onkeydown={event => onTabKeydown(event, index)}
        >{clientLabel(id)}</button>
      {/each}
    </div>

    <div id="mcp-panel" class="panel stack" role="tabpanel" aria-labelledby="mcp-tab-{client}" tabindex="0">
      {#if client === 'claude-code' || client === 'codex' || client === 'antigravity'}
        <div class="code-line">
          <pre><code class="mono" bind:this={commandEl}>{commandText}</code></pre>
          <button
            type="button"
            class="button copy-btn"
            class:copied={copiedKey === cmdKey}
            onclick={() => copy(cmdKey, commandText, commandEl)}
          >
            {@render copyIcon(copiedKey === cmdKey)}
            <span>{copiedKey === cmdKey ? t('entry.copied') : t('entry.copy')}</span>
          </button>
        </div>
        {#if client === 'claude-code' || client === 'antigravity'}
          <p class="hint">{t('mcp.authHint', { command: client === 'claude-code' ? CLAUDE_CODE_AUTH_PATH : ANTIGRAVITY_AUTH_PATH })}</p>
        {:else if client === 'codex'}
          <div class="sub-step">
            <span class="hint">{t('mcp.authStep')}</span>
            <div class="code-line">
              <pre><code class="mono" bind:this={authCommandEl}>{CODEX_LOGIN_COMMAND}</code></pre>
              <button
                type="button"
                class="button copy-btn"
                class:copied={copiedKey === authKey}
                onclick={() => copy(authKey, CODEX_LOGIN_COMMAND, authCommandEl)}
              >
                {@render copyIcon(copiedKey === authKey)}
                <span>{copiedKey === authKey ? t('entry.copied') : t('entry.copy')}</span>
              </button>
            </div>
          </div>
        {/if}
      {:else if client === 'cursor' || client === 'vscode'}
        <div class="row">
          <a
            class="button primary"
            href={client === 'cursor' ? cursorInstallUrl(endpoint) : vscodeInstallUrl(endpoint)}
          >{t('mcp.installIn', { client: client === 'cursor' ? 'Cursor' : 'VS Code' })}</a>
        </div>
        <div class="config-block">
          <div class="config-head">
            <span class="hint">{t('mcp.manualConfig', { file: configFile })}</span>
            <button
              type="button"
              class="button compact copy-btn"
              class:copied={copiedKey === cfgKey}
              onclick={() => copy(cfgKey, configText, configEl)}
            >
              {@render copyIcon(copiedKey === cfgKey)}
              <span>{copiedKey === cfgKey ? t('entry.copied') : t('entry.copy')}</span>
            </button>
          </div>
          <pre><code class="mono" bind:this={configEl}>{configText}</code></pre>
        </div>
      {:else if client === 'claude' || client === 'chatgpt'}
        <p class="app-steps">{t(client === 'claude' ? 'mcp.claudeSteps' : 'mcp.chatgptSteps')}</p>
        <div class="row">
          <a
            class="text-link small"
            href={client === 'claude' ? CLAUDE_CONNECTOR_DOCS : CHATGPT_MCP_DOCS}
            target="_blank"
            rel="noopener"
          >{t('mcp.docsLink', { client: client === 'claude' ? 'Claude' : 'ChatGPT' })} ↗</a>
        </div>
      {:else}
        <div class="config-block">
          <div class="config-head">
            <span class="hint">{t('mcp.jsonHint')}</span>
            <button
              type="button"
              class="button compact copy-btn"
              class:copied={copiedKey === cfgKey}
              onclick={() => copy(cfgKey, configText, configEl)}
            >
              {@render copyIcon(copiedKey === cfgKey)}
              <span>{copiedKey === cfgKey ? t('entry.copied') : t('entry.copy')}</span>
            </button>
          </div>
          <pre><code class="mono" bind:this={configEl}>{configText}</code></pre>
        </div>
      {/if}
    </div>
  </section>

  <section class="stack tools-section" aria-labelledby="mcp-tools-heading">
    <h2 id="mcp-tools-heading">{t('mcp.toolsTitle')}</h2>
    <ul class="tools">
      {#each data.tools as tool (tool.name)}
        <li class="tool">
          <div class="tool-head">
            <code class="mono tool-name">{tool.name}</code>
            <span class="badge" class:write={tool.write}>{tool.write ? t('mcp.access.write') : t('mcp.access.read')}</span>
          </div>
          <p class="tool-desc">{t(`mcp.tool.${tool.name}`)}</p>
        </li>
      {/each}
    </ul>
  </section>

  <section class="stack section">
    <h2>{t('mcp.authTitle')}</h2>
    <p>{t('mcp.authBody')}</p>
    <p>{t('mcp.writesBody')}</p>
  </section>

  <span class="sr-only" aria-live="polite">{copiedKey ? t('entry.copied') : ''}</span>
</div>

<style>
  .mcp-page { gap: 28px }
  .head { gap: 8px }
  .intro { max-width: 62ch; color: var(--muted); font-size: 15px }

  .endpoint-card {
    display: flex; flex-direction: column; gap: 10px;
    padding: 18px; border: 1px solid var(--line); border-radius: 12px;
    background: var(--surface);
  }
  .endpoint-meta { display: flex; align-items: center; gap: 8px }
  .kind {
    padding: 1px 7px; border-radius: 4px;
    background: var(--surface-sunken); color: var(--accent);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 10.5px; font-weight: 600; letter-spacing: .08em;
  }
  .endpoint-label { color: var(--muted); font-size: 12.5px; font-weight: 500 }

  .code-line {
    display: flex; align-items: center; gap: 10px;
    min-inline-size: 0;
  }
  .code-line > code, .code-line > pre {
    flex: 1 1 auto; min-inline-size: 0; margin: 0;
    padding: 10px 12px; border: 1px solid var(--line); border-radius: 7px;
    background: var(--surface-sunken);
    font-size: 13px; line-height: 1.45;
    overflow-x: auto; white-space: pre;
  }
  .copy-btn { flex: none; white-space: nowrap }
  .copy-btn.copied { border-color: var(--good); background: var(--good-light); color: var(--good) }
  .copy-btn.primary.copied { border-color: var(--good); background: var(--good-light); color: var(--good) }
  .button.compact { min-block-size: max(32px, var(--target-size)); padding: 4px 10px; font-size: 12.5px }

  .facts { display: flex; flex-wrap: wrap; margin: 0; border-block: 1px solid var(--line) }
  .facts > div { flex: 1 1 160px; padding: 13px 0 }
  .facts > div + div { padding-inline-start: 24px; border-inline-start: 1px solid var(--line) }
  .facts dt { color: var(--muted); font-size: 12px }
  .facts dd { margin: 0; font-size: 16px; font-weight: 600 }

  .setup-section { gap: 12px }
  .tabs {
    display: inline-flex; flex-wrap: wrap; align-items: center; gap: 2px;
    align-self: flex-start; max-inline-size: 100%;
    padding: 3px; border: 1px solid var(--line); border-radius: 9px;
    background: var(--surface);
  }
  .tab {
    min-block-size: max(32px, var(--target-size));
    padding: 5px 11px; border: 0; border-radius: 6px;
    background: none; color: var(--muted);
    font-size: 13px; font-weight: 500; cursor: pointer;
    transition: color .12s, background-color .12s;
  }
  .tab:hover { color: var(--ink); background: var(--surface-sunken) }
  .tab.on { background: var(--surface-selected); color: var(--ink) }

  .panel {
    gap: 14px; padding: 18px;
    border: 1px solid var(--line); border-radius: 12px;
    background: var(--surface);
  }
  .sub-step { display: flex; flex-direction: column; gap: 6px; min-inline-size: 0 }
  .config-block { display: flex; flex-direction: column; gap: 8px; min-inline-size: 0 }
  .config-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px }
  .config-block pre {
    margin: 0; padding: 12px 14px;
    border: 1px solid var(--line); border-radius: 7px;
    background: var(--surface-sunken);
    font-size: 13px; line-height: 1.5;
    overflow-x: auto; max-inline-size: 100%;
  }
  .app-steps { color: var(--ink); max-width: 62ch }

  pre, .code-line > code {
    scrollbar-width: thin;
    scrollbar-color: var(--line-strong) transparent;
  }
  @supports not (scrollbar-color: auto) {
    pre::-webkit-scrollbar, .code-line > code::-webkit-scrollbar { width: 6px; height: 6px }
    pre::-webkit-scrollbar-thumb, .code-line > code::-webkit-scrollbar-thumb { background: var(--line-strong); border-radius: 999px }
    pre::-webkit-scrollbar-track, .code-line > code::-webkit-scrollbar-track { background: transparent }
  }

  .tools-section { gap: 12px }
  .tools {
    margin: 0; padding: 0; list-style: none;
    border: 1px solid var(--line); border-radius: 12px;
    background: var(--surface); overflow: hidden;
  }
  .tool { display: flex; flex-direction: column; gap: 4px; padding: 14px 18px }
  .tool + .tool { border-top: 1px solid var(--line) }
  .tool-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px }
  .tool-name { font-size: 13.5px; font-weight: 600 }
  .badge.write { background: var(--accent-light); color: var(--accent) }
  .tool-desc { color: var(--muted); font-size: 13.5px }

  .section { max-width: 70ch; gap: 8px }
  .section p { color: var(--muted) }

  @media (prefers-reduced-motion: reduce) {
    .tab { transition: none }
  }
  @media (max-width: 760px) {
    .facts > div { flex-basis: 100% }
    .facts > div + div { padding-inline-start: 0; border-inline-start: 0; border-block-start: 1px solid var(--line) }
  }
  @media (max-width: 560px) {
    .code-line { flex-direction: column; align-items: stretch }
    .code-line .copy-btn { align-self: flex-start }
    .endpoint-card, .panel { padding: 14px }
    .tool { padding: 12px 14px }
  }
</style>
