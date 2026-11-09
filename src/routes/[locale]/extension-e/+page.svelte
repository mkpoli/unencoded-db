<script lang="ts">
  import { EXTENSION_E_WITHDRAWN, EXTENSION_E_WRONG_GLYPH } from '$lib/extension-e'
  import { t, type Locale } from '$lib/i18n'
  let { data }: { data: { locale: Locale } } = $props()
  const wrong = EXTENSION_E_WRONG_GLYPH.size
  const unresolved = EXTENSION_E_WITHDRAWN.length - wrong
</script>

<svelte:head><title>{t(data.locale, 'extensionE.title')} · {t(data.locale, 'app.name')}</title></svelte:head>
<div class="page">
  <header class="page-heading">
    <p class="eyebrow">{t(data.locale, 'extensionE.eyebrow')}</p>
    <h1>{t(data.locale, 'extensionE.title')}</h1>
    <p>{t(data.locale, 'extensionE.intro', { total: EXTENSION_E_WITHDRAWN.length, unresolved })}</p>
  </header>
  <p class="field-help">
    <a class="text-link" href="https://www.unicode.org/irg/docs/n1841-ExtensionEWithdraw.pdf">IRG N1841</a>
    · 2012-01-01 · {t(data.locale, 'extensionE.coverage', { wrong })}
  </p>
  <div class="table-wrap">
    <table>
      <thead><tr><th>{t(data.locale, 'extensionE.id')}</th><th>{t(data.locale, 'extensionE.withdrawal')}</th><th>{t(data.locale, 'extensionE.later')}</th></tr></thead>
      <tbody>
        {#each EXTENSION_E_WITHDRAWN as id}
          <tr>
            <td class="mono">{id}</td>
            <td>{t(data.locale, 'extensionE.withdrawn')}</td>
            <td>{EXTENSION_E_WRONG_GLYPH.has(id) ? t(data.locale, 'extensionE.wrongGlyph') : t(data.locale, 'extensionE.unresolved')}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
<style>
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { color: var(--muted); font-weight: 500; }
  .mono { font-family: var(--mono); white-space: nowrap; }
</style>
