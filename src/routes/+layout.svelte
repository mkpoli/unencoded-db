<script lang="ts">
  import '../style.css'
  import type { Snippet } from 'svelte'

  let { children }: { children: Snippet } = $props()
</script>
{@render children()}
