<script lang="ts">
  import { enhance } from '$app/forms'
  import { untrack } from 'svelte'
  import { handleContributionResult } from '$lib/contribution-result'
  import { newComparison, removeComparison } from '$lib/comparison-rows'
  let { form } = $props()
  let rateLimitFailure = $state<429 | 503 | null>(null)
  let comparisons = $state<{ character: string; relationship: string; differences: string; evidence: string }[]>(untrack(() => form?.comparisons?.rows ?? []))
  let comparisonErrors = $state<string[]>(untrack(() => form?.comparisons?.errors ?? []))
  function addComparison() {
    comparisons.push(newComparison())
    comparisonErrors.push('')
  }
  function removeRow(index: number) {
    const next = removeComparison(comparisons, comparisonErrors, index)
    comparisons = next.rows
    comparisonErrors = next.errors
  }
</script>
<svelte:head><title>Add evidence · 珍字集覽</title></svelte:head>
<div class="form-page">
  <div class="page-heading">
    <h1>Add evidence</h1>
    <p>Provide a source URL for the evidence. Contributions are public and anonymous.</p>
  </div>
  {#if form?.errors}<p class="notice error" role="alert">Check the fields below.</p>{/if}
  {#if rateLimitFailure}<p class="notice error" role="alert">{rateLimitFailure === 429 ? 'Too many requests. Try again in a minute.' : 'Contributions are temporarily unavailable. Try again later.'}</p>{/if}
  <form method="POST" use:enhance={() => {
    rateLimitFailure = null
    return async ({ result, update }) => handleContributionResult(result, status => { rateLimitFailure = status }, update)
  }}>
    <section class="panel" aria-labelledby="source-heading">
      <h2 id="source-heading">Source</h2>
      <div class="field">
        <label>Place seen <input name="place" maxlength="500" value={form?.values?.place ?? ''} aria-invalid={!!form?.errors?.place} aria-describedby={form?.errors?.place ? 'place-error' : undefined} /></label>
        {#if form?.errors?.place}<p class="field-error" id="place-error">{form.errors.place}</p>{/if}
      </div>
      <div class="field">
        <label>Source URL <input name="url" type="url" required maxlength="1000" value={form?.values?.url ?? ''} aria-invalid={!!form?.errors?.url} aria-describedby={form?.errors?.url ? 'url-error' : undefined} /></label>
        {#if form?.errors?.url}<p class="field-error" id="url-error">{form.errors.url}</p>{/if}
      </div>
      <details open={!!(form?.errors?.title || form?.errors?.author || form?.errors?.publisher || form?.errors?.year || form?.errors?.page)}>
        <summary>Bibliographic details <span>Optional</span></summary>
        <div class="details-fields">
          <div class="field"><label>Title <input name="title" maxlength="300" value={form?.values?.title ?? ''} aria-invalid={!!form?.errors?.title} aria-describedby={form?.errors?.title ? 'title-error' : undefined} /></label>{#if form?.errors?.title}<p class="field-error" id="title-error">{form.errors.title}</p>{/if}</div>
          <div class="field"><label>Author <input name="author" maxlength="300" value={form?.values?.author ?? ''} aria-invalid={!!form?.errors?.author} aria-describedby={form?.errors?.author ? 'author-error' : undefined} /></label>{#if form?.errors?.author}<p class="field-error" id="author-error">{form.errors.author}</p>{/if}</div>
          <div class="field"><label>Publisher <input name="publisher" maxlength="300" value={form?.values?.publisher ?? ''} aria-invalid={!!form?.errors?.publisher} aria-describedby={form?.errors?.publisher ? 'publisher-error' : undefined} /></label>{#if form?.errors?.publisher}<p class="field-error" id="publisher-error">{form.errors.publisher}</p>{/if}</div>
          <div class="field-grid">
            <div class="field"><label>Year <input name="year" maxlength="40" value={form?.values?.year ?? ''} aria-invalid={!!form?.errors?.year} aria-describedby={form?.errors?.year ? 'year-error' : undefined} /></label>{#if form?.errors?.year}<p class="field-error" id="year-error">{form.errors.year}</p>{/if}</div>
            <div class="field"><label>Page <input name="page" maxlength="80" value={form?.values?.page ?? ''} aria-invalid={!!form?.errors?.page} aria-describedby={form?.errors?.page ? 'page-error' : undefined} /></label>{#if form?.errors?.page}<p class="field-error" id="page-error">{form.errors.page}</p>{/if}</div>
          </div>
        </div>
      </details>
      <div class="field"><label>Notes <textarea name="note" maxlength="5000" aria-invalid={!!form?.errors?.note} aria-describedby={form?.errors?.note ? 'note-error' : undefined}>{form?.values?.note ?? ''}</textarea></label>{#if form?.errors?.note}<p class="field-error" id="note-error">{form.errors.note}</p>{/if}</div>
    </section>
    <section class="panel" aria-labelledby="character-heading">
      <h2 id="character-heading">Character</h2>
      <div class="field"><label>Script <input name="script" required maxlength="80" value={form?.values?.script ?? 'Han'} aria-invalid={!!form?.errors?.script} aria-describedby={form?.errors?.script ? 'script-error' : undefined} /></label>{#if form?.errors?.script}<p class="field-error" id="script-error">{form.errors.script}</p>{/if}</div>
      <div class="field"><label>IDS <input name="ids" maxlength="200" value={form?.values?.ids ?? ''} aria-invalid={!!form?.errors?.ids} aria-describedby={form?.errors?.ids ? 'ids-error' : undefined} /></label>{#if form?.errors?.ids}<p class="field-error" id="ids-error">{form.errors.ids}</p>{/if}</div>
      <div class="field"><label>Character description <textarea name="description" maxlength="5000" aria-invalid={!!form?.errors?.description} aria-describedby={form?.errors?.description ? 'description-error' : undefined}>{form?.values?.description ?? ''}</textarea></label>{#if form?.errors?.description}<p class="field-error" id="description-error">{form.errors.description}</p>{/if}</div>
    </section>
    <section class="panel" aria-labelledby="related-heading">
      <h2 id="related-heading">Related characters</h2>
      <p>Compare up to 10 characters.</p>
      {#if comparisons.length > 10}<p class="field-error" role="alert">Remove comparisons until there are at most 10.</p>{/if}
      {#each comparisons as comparison, i}
        <fieldset class="comparison">
          <legend>Comparison {i + 1}</legend>
          <div class="comparison-fields">
          {#if comparisonErrors[i]}<p class="field-error" role="alert">{comparisonErrors[i]}</p>{/if}
          <div class="field"><label>Character <input name="comparison_character" required maxlength="200" bind:value={comparison.character} /></label></div>
          <div class="field"><label>Relationship <select name="comparison_relationship" bind:value={comparison.relationship}>
            <option value="variant">Variant</option><option value="not_variant">Not a variant</option><option value="similar">Similar</option><option value="uncertain">Uncertain</option>
          </select></label></div>
          <div class="field"><label>Differences <textarea name="comparison_differences" maxlength="2000" bind:value={comparison.differences}></textarea></label></div>
          <div class="field"><label>Evidence <textarea name="comparison_evidence" maxlength="2000" bind:value={comparison.evidence}></textarea></label></div>
          <button class="secondary" type="button" onclick={() => removeRow(i)}>Remove comparison</button>
          </div>
        </fieldset>
      {/each}
      <button class="secondary" type="button" disabled={comparisons.length >= 10} onclick={addComparison}>Add comparison</button>
    </section>
    <button type="submit">Save evidence</button>
  </form>
</div>
