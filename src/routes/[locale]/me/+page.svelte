<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import { href, locale, t } from '$lib/t'
  let { data, form } = $props()
</script>

<Seo title={t('me.title')} />
<div class="page narrow stack">
  <h1>{t('me.title')}</h1>
  {#if data.person}
    <p>{t('me.intro')}</p>
    <div><a class="button" href={href(`/u/${data.person.id}`)}>{t('me.contributions')}</a></div>
    <form method="POST" class="stack">
      <div class="field"><label for="name">{t('me.name')}</label><input class="input" id="name" name="name" value={data.person.name} required maxlength="40" /></div>
      {#if form?.error}<p class="notice bad">{t(`error.${form.error}`)}</p>{/if}
      <div><button class="button primary" type="submit">{t('form.save')}</button></div>
    </form>
  {:else}
    <p>{t('me.none')}</p>
  {/if}
  {#if data.person?.atlas}
    <form method="POST" action="/auth/sign-out?locale={locale()}"><button class="button" type="submit">{t('nav.signOut')}</button></form>
  {:else if data.signIn}
    <div><a class="button" href="/auth/sign-in?locale={locale()}" data-sveltekit-reload>{t('nav.signIn')} · Glyph Atlas</a></div>
  {/if}
</div>
