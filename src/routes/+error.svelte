<script lang="ts">
  import { page } from '$app/state'
</script>

<h1>{page.status}</h1>
<p>{page.status === 404 ? 'Page not found.' : 'Something went wrong.'}</p>
<p><a href="/">All evidence</a></p>
