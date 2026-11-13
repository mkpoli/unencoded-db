<script lang="ts" module>
  // `value` is what the form sends for a choice. `token` names it while the page is open, and is the
  // same as the value unless the value can change, as the place of a sighting on the add form does.
  export type Choice = { token: string; value: string; label: string }
</script>

<script lang="ts">
  // The claims or sightings a row refers to, any number of them: a group of checkboxes that all send
  // `name`. Nothing is drawn while there is nothing to choose from.
  import CheckPill from './CheckPill.svelte'

  let { legend, name, options, chosen = $bindable([]) }: { legend: string; name?: string; options: Choice[]; chosen?: string[] } = $props()
  const toggle = (token: string, on: boolean) => { chosen = on ? [...chosen.filter(item => item !== token), token] : chosen.filter(item => item !== token) }
</script>

{#if options.length}
  <fieldset class="choice">
    <legend>{legend}</legend>
    <div class="pills">
      {#each options as option (option.token)}<CheckPill {name} value={option.value} label={option.label} checked={chosen.includes(option.token)} onchange={on => toggle(option.token, on)} />{/each}
    </div>
  </fieldset>
{/if}

<style>
  .choice { min-width: 0; margin: 0; padding: 0; border: 0 }
  /* The legend stands before its choices on one line, and above them where the line is short. */
  legend { float: inline-start; width: 6.5em; padding: 0; font-weight: 500; line-height: 40px }
  .pills { display: flex; flex-wrap: wrap; gap: 8px; min-width: 0 }
  @media (max-width: 560px) { legend { float: none; width: auto; margin-bottom: 4px; line-height: 1.5 } }
  .pills > :global(.pill) { max-width: min(100%, 22em) }
</style>
