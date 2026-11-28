import { beforeEach, describe, expect, test } from 'bun:test'
import { newClaim } from '$lib/claims'
import { createEntry } from './entries'
import { assertAgentActor, createPerson, resolveAgentActor } from './people'
import { openTestDb } from './testdb'

describe('agent actor attribution guard', () => {
  let db: D1Database
  let raw: ReturnType<typeof openTestDb>['raw']

  beforeEach(() => {
    ;({ db, raw } = openTestDb())
  })

  test('resolveAgentActor creates and reuses an agent row merged under the commander', async () => {
    const commander = await createPerson(db, 'sub-1', 'Commander')
    const first = await resolveAgentActor(db, { agent: 'Antigravity', model: 'Gemini 4 Neon', commander: commander.id })
    const second = await resolveAgentActor(db, { agent: 'Antigravity', model: 'Gemini 4 Neon', commander: commander.id })
    expect(first.actor).toBe(second.actor)
    expect(first.actor).not.toBe(commander.id)
    expect(first.ip).toBeNull()

    await expect(assertAgentActor(db, first.actor)).resolves.toBeUndefined()

    const entryId = await createEntry(
      db,
      { description: null, radical: null, strokes: null, claims: [newClaim('ids', '⿰木木')] },
      { place: 'Test', url: null, title: null, author: null, publisher: null, report_date: null, container: null, source_kind: null, vias: [], closeness: null, original_date: null, page: null, contexts: null, style: null, types: null, quotes: null, note: null },
      [],
      first,
    )
    const rev = raw.query('SELECT actor, agent FROM revisions WHERE entry_id = ? AND kind = ?').get(entryId, 'create') as { actor: string; agent: number }
    expect(rev).toEqual({ actor: first.actor, agent: 1 })
  })

  test('assertAgentActor rejects human and unknown actors', async () => {
    const human = await createPerson(db, 'sub-2', 'Human')
    await expect(assertAgentActor(db, human.id)).rejects.toThrow('non-agent actor')
    await expect(assertAgentActor(db, 'does-not-exist')).rejects.toThrow('non-agent actor')
  })

  test('resolveAgentActor rejects invalid commanders and blank agent names', async () => {
    const human = await createPerson(db, 'sub-3', 'Human')
    const agent = await resolveAgentActor(db, { agent: 'Codex', model: 'GPT', commander: human.id })
    await expect(resolveAgentActor(db, { agent: '   ', commander: human.id })).rejects.toThrow('1..40')
    await expect(resolveAgentActor(db, { agent: 'Bot', commander: agent.actor })).rejects.toThrow('Invalid commander')
    await expect(resolveAgentActor(db, { agent: 'Bot', commander: 'missing' })).rejects.toThrow('Invalid commander')
  })
})
