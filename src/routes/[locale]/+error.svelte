<script lang="ts">
  import { page } from '$app/state'
  import ErrorPage from '$lib/components/ErrorPage.svelte'
  import { isLocale, localeFromPathname, type Locale } from '$lib/i18n'

  const locale = $derived((isLocale(page.data.locale) ? page.data.locale : localeFromPathname(page.url.pathname) ?? 'en') as Locale)
</script>

<ErrorPage {locale} status={page.status} />
