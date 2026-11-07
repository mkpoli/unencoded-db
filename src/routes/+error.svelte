<script lang="ts">
  import { page } from '$app/state'
</script>

<h1>{page.status}</h1>
<p>{page.status === 404 ? 'Page not found.' : page.status === 409 ? page.error?.message ?? 'The entry changed before this action could be applied.' : 'Something went wrong.'}</p>
<p><a href={page.status === 409 ? '/moderate' : '/'}>{page.status === 409 ? 'Back to moderation' : 'All evidence'}</a></p>
