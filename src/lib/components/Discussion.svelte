<script lang="ts">
  // The discussion of a record: its comments, oldest first, and the form that adds one.
  import type { Comment } from '$lib/server/comments'
  import { recordCode } from '$lib/code'
  import { COMMENT_MAX } from '$lib/comments'
  import { href, t, when } from '$lib/t'

  let { entry, comments, sightings, about = null, moderator = false, error = null, draft = '' }: {
    entry: number; comments: Comment[]; sightings: number[]; about?: number | null; moderator?: boolean; error?: string | null; draft?: string
  } = $props()
</script>

<section class="stack discussion" id="discussion">
  <h2>{t('discussion.title')}</h2>
  {#if comments.length}
    <ol class="comments">
      {#each comments as comment (comment.id)}
        <li id="comment-{comment.id}" class:hidden={comment.hidden_at}>
          <div class="meta">
            {#if comment.by_name}<a class="text-link" href={href(`/u/${comment.by_id}`)}>{comment.by_name}</a>{/if}
            <time datetime={comment.at}>{when(comment.at)}</time>
            {#if comment.sighting_id && sightings.includes(comment.sighting_id)}<a class="badge" href="#sighting-{comment.sighting_id}">{t('discussion.about', { id: comment.sighting_id })}</a>{/if}
            {#if comment.hidden_at}<span class="badge">{t('discussion.hidden')}</span>{/if}
            {#if moderator}
              <form method="POST" action={comment.hidden_at ? '?/unhideComment' : '?/hideComment'}>
                <input type="hidden" name="comment" value={comment.id} />
                <button class="text-link plain" type="submit">{t(comment.hidden_at ? 'discussion.unhide' : 'discussion.hide')}</button>
              </form>
            {/if}
          </div>
          <p class="body">{comment.body}</p>
        </li>
      {/each}
    </ol>
  {/if}
  <form class="stack write" method="POST" action="?/comment#discussion">
    {#if error}<p class="notice bad" role="alert">{t(`error.${error}`)}</p>{/if}
    {#if about}
      <p class="row about"><span class="badge">{t('discussion.about', { id: about })}</span><a class="text-link small" href="{href(`/${recordCode(entry)}`)}#discussion">{t('discussion.wholeRecord')}</a><input type="hidden" name="about" value={about} /></p>
    {/if}
    <div class="field">
      <label for="comment-body">{t('discussion.comment')}</label>
      <textarea class="input" id="comment-body" name="body" rows="4" maxlength={COMMENT_MAX} required>{draft}</textarea>
    </div>
    <div><button class="button primary" type="submit">{t('discussion.post')}</button></div>
  </form>
</section>

<style>
  .discussion { scroll-margin-block: 16px }
  .comments { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; border: 1px solid var(--line); border-radius: 10px; background: var(--surface) }
  .comments li { display: flex; flex-direction: column; gap: 6px; padding: 14px 20px; scroll-margin-block: 16px }
  .comments li + li { border-top: 1px solid var(--line) }
  .comments li:target { outline: 2px solid var(--accent); outline-offset: -2px; border-radius: 10px }
  .comments li.hidden .body { color: var(--muted) }
  .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; font-size: 12.5px; color: var(--muted) }
  .meta time { font-variant-numeric: tabular-nums }
  .meta form { margin-inline-start: auto }
  .plain { padding: 0; border: 0; background: none; font: inherit; color: inherit; cursor: pointer }
  .body { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.6 }
  .about { margin: 0 }
  .write { gap: 12px }
  @media (max-width: 700px) { .comments li { padding: 12px 16px } }
</style>
