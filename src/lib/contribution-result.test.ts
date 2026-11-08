import { describe, expect, test } from 'bun:test'
import type { ActionResult } from '@sveltejs/kit'
import { handleContributionResult } from './contribution-result'

describe('enhanced contribution result', () => {
  test('shows inline limiter failures without applying or resetting the form', async () => {
    const notices: number[] = []
    let updates = 0
    for (const status of [429, 503]) {
      await handleContributionResult({ type: 'failure', status }, value => { notices.push(value) }, async () => { updates++ })
    }
    expect(notices).toEqual([429, 503])
    expect(updates).toBe(0)
  })
  test('uses normal SvelteKit updates for validation and redirects', async () => {
    const results: ActionResult[] = [
      { type: 'failure', status: 400, data: { errors: { script: 'Required' }, values: { note: 'draft' } } },
      { type: 'redirect', status: 303, location: '/entry/1' },
      { type: 'error', status: 500, error: {} },
      { type: 'success', status: 200 }
    ]
    let updates = 0
    let notices = 0
    for (const result of results) await handleContributionResult(result, () => { notices++ }, async () => { updates++ })
    expect(updates).toBe(results.length)
    expect(notices).toBe(0)
  })
})
