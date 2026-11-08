<script lang="ts">
  import { page } from '$app/state'
  import ErrorPage from '$lib/components/ErrorPage.svelte'
</script>

<main><ErrorPage locale="en" status={page.status} /></main>
