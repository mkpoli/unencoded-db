<script lang="ts">
  import { localizedHref, t, type Locale } from '$lib/i18n'

  let { locale, status }: { locale: Locale; status: number } = $props()
  const message = $derived(status === 404 ? t(locale, 'error.notFound') : t(locale, 'error.title'))
</script>

<svelte:head><title>{message} · {t(locale, 'app.name')}</title></svelte:head>
<h1>{message}</h1>
<p>{status}</p>
<p><a href={localizedHref(locale)}>{t(locale, 'error.home')}</a></p>
