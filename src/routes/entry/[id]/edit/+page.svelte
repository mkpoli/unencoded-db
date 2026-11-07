<script lang="ts">
  let { data, form } = $props()
  const fields = [
    { name: 'script', label: 'Script', max: 80, required: true },
    { name: 'ids', label: 'IDS', max: 200 },
    { name: 'description', label: 'Character description', max: 5000 },
    { name: 'place', label: 'Place seen (up to 500 characters, or the source URL)', max: 1000 },
    { name: 'url', label: 'Source URL', max: 1000, required: true },
    { name: 'title', label: 'Title', max: 300 },
    { name: 'author', label: 'Author', max: 300 },
    { name: 'publisher', label: 'Publisher', max: 300 },
    { name: 'year', label: 'Year', max: 40 },
    { name: 'page', label: 'Page', max: 80 },
    { name: 'note', label: 'Notes', max: 5000 }
  ] as const
</script>
<svelte:head><title>Revise evidence · 珍字集覽</title></svelte:head>
<p><a href="/entry/{data.entry.id}">← Evidence</a></p>
<div class="form-page">
  <h1>Revise evidence</h1>
  <p>Changes are public and anonymous. Earlier versions remain visible.</p>
  {#if form?.message}<p class="notice error" role="alert">{form.message}</p>{/if}
  <form method="POST">
    <input type="hidden" name="revision" value={form?.revision ?? data.entry.revision} />
    <section class="panel">
      {#each fields as field}
        <div class="field">
          <label>{field.label}
            {#if field.name === 'description' || field.name === 'note'}
              <textarea name={field.name} maxlength={field.max} aria-invalid={!!form?.errors?.[field.name]} aria-describedby={form?.errors?.[field.name] ? `${field.name}-error` : undefined}>{form?.values?.[field.name] ?? data.entry[field.name] ?? ''}</textarea>
            {:else}
              <input name={field.name} type={field.name === 'url' ? 'url' : 'text'} required={'required' in field && field.required} maxlength={field.max} value={form?.values?.[field.name] ?? data.entry[field.name] ?? ''} aria-invalid={!!form?.errors?.[field.name]} aria-describedby={form?.errors?.[field.name] ? `${field.name}-error` : undefined} />
            {/if}
          </label>
          {#if form?.errors?.[field.name]}<p class="field-error" id="{field.name}-error">{form.errors[field.name]}</p>{/if}
        </div>
      {/each}
    </section>
    <button type="submit">Save revision</button>
  </form>
</div>
