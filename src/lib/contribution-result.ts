import type { ActionResult } from '@sveltejs/kit'

/** Leave the form untouched when the pre-body limiter rejects a submission. */
export async function handleContributionResult(result: ActionResult, showFailure: (status: 429 | 503) => void, update: () => Promise<void>) {
  if (result.type === 'failure' && (result.status === 429 || result.status === 503)) {
    showFailure(result.status)
    return
  }
  await update()
}
