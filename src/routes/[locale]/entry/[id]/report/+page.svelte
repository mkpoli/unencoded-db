<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import { href, t } from '$lib/t'
  let { data, form } = $props()
</script>

<Seo title={t('report.title')} />
<div class="page narrow stack">
  <a class="text-link back" href={href(`/entry/${data.target.entry}`)}>← {t('history.back')}</a>
  <h1>{t('report.title')}</h1>
  {#if form?.sent}
    <p role="status">{t('report.sent')}</p>
  {:else}
    <p class="muted">{t('report.hint')}</p>
    {#if form?.error}<p class="notice bad" role="alert">{t(`error.${form.error}`)}</p>{/if}
    <form method="POST" class="stack">
      <div class="field">
        <label for="reason">{t('error.reason')}</label>
        <textarea class="input" id="reason" name="reason" rows="5" maxlength="2000" required>{form?.reason ?? ''}</textarea>
      </div>
      <div><button class="button primary" type="submit">{t('report.send')}</button></div>
    </form>
  {/if}
</div>
<style>
  .back { align-self: start; color: var(--muted) }
</style>
