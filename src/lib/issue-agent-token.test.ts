import { expect, test } from 'bun:test'
import { tokenPerson } from '$lib/server/agents'
import { openTestDb } from '$lib/server/testdb'
import { buildIssueTokenSql, parseIssueTokenArgs, validateExistingPerson } from '../../scripts/issue-agent-token'

test('parseIssueTokenArgs parses member, moderator, and existing-person invocations and rejects invalid flags', () => {
  expect(parseIssueTokenArgs(['--remote', '--name', '大肥魚', '--out', '/tmp/tok'])).toEqual({
    where: '--remote',
    name: '大肥魚',
    person: null,
    out: '/tmp/tok',
    moderator: false,
  })
  expect(parseIssueTokenArgs(['--local', '--name', '大肥魚', '--out', '/tmp/tok', '--moderator'])).toEqual({
    where: '--local',
    name: '大肥魚',
    person: null,
    out: '/tmp/tok',
    moderator: true,
  })
  expect(parseIssueTokenArgs(['--remote', '--person', 'abc123', '--out', '/tmp/tok', '--moderator'])).toEqual({
    where: '--remote',
    name: null,
    person: 'abc123',
    out: '/tmp/tok',
    moderator: true,
  })

  for (const bad of [
    [],
    ['--local', '--remote', '--name', 'a', '--out', '/tmp/x'],
    ['--local', '--name', 'a', '--person', 'p1', '--out', '/tmp/x'],
    ['--local', '--out', '/tmp/x'],
    ['--local', '--name', '   ', '--out', '/tmp/x'],
    ['--local', '--name', 'a'.repeat(41), '--out', '/tmp/x'],
    ['--local', '--person', 'bad id!', '--out', '/tmp/x'],
    ['--local', '--name', 'a', '--out', '/tmp/x', '--unknown'],
    ['--local', '--name', 'a', '--out', '/tmp/x', '--moderator', '--moderator'],
    ['--local', '--name', '--out', '/tmp/x'],
  ]) {
    expect(() => parseIssueTokenArgs(bad)).toThrow()
  }
})

test('validateExistingPerson refuses missing, merged, banned, and anonymous browser rows', () => {
  expect(() => validateExistingPerson('p1', undefined)).toThrow('does not exist')
  expect(() => validateExistingPerson('p1', { id: 'p1', name: 'Bot', role: 'member', banned_at: null, merged_into: 'p2', atlas_sub: null, agent: 1 })).toThrow('merged into p2')
  expect(() => validateExistingPerson('p1', { id: 'p1', name: 'Bot', role: 'member', banned_at: '2026-11-01T00:00:00.000Z', merged_into: null, atlas_sub: null, agent: 1 })).toThrow('banned')
  expect(() => validateExistingPerson('p1', { id: 'p1', name: 'Human', role: 'member', banned_at: null, merged_into: null, atlas_sub: null, agent: 0 })).toThrow('anonymous browser')
  expect(validateExistingPerson('p1', { id: 'p1', name: 'Bot', role: 'member', banned_at: null, merged_into: null, atlas_sub: null, agent: 1 }).id).toBe('p1')
  expect(validateExistingPerson('p2', { id: 'p2', name: 'Signed', role: 'member', banned_at: null, merged_into: null, atlas_sub: 'sub1', agent: 0 }).id).toBe('p2')
})

test('buildIssueTokenSql provisions member and moderator tokens and promotes an existing person', async () => {
  const { db, raw } = openTestDb()
  const at = new Date().toISOString()

  const memberSql = buildIssueTokenSql({
    person: 'mem001',
    name: "O'Bot",
    client: '11111111-1111-1111-1111-111111111111',
    token: 'tok-member',
    at,
    moderator: false,
    existingPerson: false,
  })
  raw.exec(memberSql)
  const member = await tokenPerson(db, 'tok-member')
  expect(member).toMatchObject({ id: 'mem001', name: "O'Bot", moderator: false, banned: false })

  const modSql = buildIssueTokenSql({
    person: 'mod001',
    name: '大肥魚',
    client: '22222222-2222-2222-2222-222222222222',
    token: 'tok-mod',
    at,
    moderator: true,
    existingPerson: false,
  })
  raw.exec(modSql)
  const mod = await tokenPerson(db, 'tok-mod')
  expect(mod).toMatchObject({ id: 'mod001', name: '大肥魚', moderator: true, banned: false })

  // Promoting an existing member via --person + --moderator keeps the same person id and grants moderator role.
  const promoteSql = buildIssueTokenSql({
    person: 'mem001',
    name: "O'Bot",
    client: '33333333-3333-3333-3333-333333333333',
    token: 'tok-promoted',
    at,
    moderator: true,
    existingPerson: true,
  })
  raw.exec(promoteSql)
  const promoted = await tokenPerson(db, 'tok-promoted')
  expect(promoted).toMatchObject({ id: 'mem001', name: "O'Bot", moderator: true, banned: false })
  expect((raw.query('SELECT COUNT(*) AS n FROM people').get() as { n: number }).n).toBe(2)
})
