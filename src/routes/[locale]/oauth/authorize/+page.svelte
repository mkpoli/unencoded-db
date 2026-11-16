<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import { href, locale, t } from '$lib/t'
  let { data } = $props()
</script>

<Seo title={t('agent.title')} />
<div class="page narrow stack">
  <h1>{t('agent.title')}</h1>
  <dl>
    <dt>{t('agent.client')}</dt>
    <dd>{#if data.client}{data.client}{' · '}{/if}<span class="mono">{data.to}</span></dd>
    <dt>{t('me.name')}</dt>
    <dd>{#if data.person}<a class="text-link" href={href(`/u/${data.person.id}`)}>{data.person.name}</a>{:else}{t('agent.newName')}{/if}</dd>
  </dl>
  <!-- Sign-in goes through Glyph Atlas. Until this browser is signed in there, that is the first choice,
       and allowing the agent under the browser's own name is the second. -->
  <form method="POST" class="row">
    {#if data.signIn && !data.person?.atlas}
      <a class="button primary" href="/auth/sign-in?locale={locale()}&next={encodeURIComponent(data.next)}" data-sveltekit-reload>{t('nav.signIn')} · Glyph Atlas</a>
      <button class="button" type="submit" name="decision" value="allow">{t('agent.allow')}</button>
    {:else}
      <button class="button primary" type="submit" name="decision" value="allow">{t('agent.allow')}</button>
    {/if}
    <button class="button" type="submit" name="decision" value="deny">{t('form.cancel')}</button>
  </form>
</div>

<style>
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 8px 18px; margin: 0 }
  dt { color: var(--muted) }
  dd { margin: 0; min-width: 0; overflow-wrap: anywhere }
</style>
