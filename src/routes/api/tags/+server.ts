import { json } from '@sveltejs/kit'
import { env, guardWrite, ipHash } from '$lib/server/guard'
import { writer } from '$lib/server/people'
import {
  createGroup,
  createTag,
  deleteGroup,
  aliasTag,
  deleteTag,
  implyTag,
  mergeTag,
  nameTier,
  moveGroup,
  moveTag,
  renameGroup,
  renameTag,
  tagChanges,
  taxonomy,
  unaliasTag,
  undoTagChange,
  unimplyTag,
  type ChangeCode,
} from '$lib/server/tags'
import { positiveId } from '../../_submission.server'
import type { RequestHandler } from './$types'

const STATUS_BY_CODE: Partial<Record<ChangeCode, number>> = {
  conflict: 409,
  exists: 409,
  aliased: 409,
  missing: 404,
  slow: 429,
  too_large: 413,
}

const optionalRev = (value: unknown) => {
  if (value === undefined || value === null || value === '') return undefined
  const num = Number(value)
  return Number.isSafeInteger(num) && num >= 0 ? num : null
}

const textField = (value: unknown) => (typeof value === 'string' ? value : '')
const idField = (value: unknown) => (typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null)
// A group's id, or null for none; undefined when the field is malformed.
const groupField = (value: unknown) => (value === null || value === undefined ? null : idField(value) ?? undefined)
const indexField = (value: unknown) => (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined)

async function snapshot(db: D1Database) {
  const [{ tags, groups }, changes] = await Promise.all([taxonomy(db, true), tagChanges(db)])
  return { tags, groups, changes }
}

export const GET: RequestHandler = async (event) => {
  const db = env(event).DB
  const used = event.url.searchParams.has('used')
  const [{ tags, groups }, changes] = await Promise.all([taxonomy(db, used), tagChanges(db)])
  return json({ tags, groups, changes })
}

export const POST: RequestHandler = async (event) => {
  // Arranging tags is editing; making a tag or a group is also an add.
  await guardWrite(event, 'EDITS')
  let body: Record<string, unknown>
  try {
    const parsed = await event.request.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return json({ error: 'invalid' }, { status: 400 })
    }
    body = parsed as Record<string, unknown>
  } catch {
    return json({ error: 'invalid' }, { status: 400 })
  }

  const db = env(event).DB
  const { tags, groups } = await taxonomy(db)
  const person = await writer(event, db)
  const who = { actor: person.id, ip: await ipHash(event) }
  const action = textField(body.action)
  if (action === 'create' || action === 'group.create') await guardWrite(event, 'ADDS')

  if (action === 'create') {
    const implies = Array.isArray(body.implies)
      ? body.implies.filter((item): item is string => typeof item === 'string')
      : []
    const group = groupField(body.group)
    if (group === undefined) return json({ error: 'invalid' }, { status: 400 })
    const result = await createTag(
      db,
      tags,
      { name: textField(body.name), type: typeof body.type === 'string' ? body.type : undefined, group, implies },
      who,
      groups,
    )
    if (!result.ok) {
      return json({ error: result.code, ...(result.code === 'conflict' ? await snapshot(db) : {}) }, { status: result.code === 'conflict' ? 409 : 400 })
    }
    return json({ ok: true, value: result.value, created: result.created, ...(await snapshot(db)) })
  }

  const rev = optionalRev(body.rev)
  if (rev === null) return json({ error: 'invalid' }, { status: 400 })

  const fail = async (code: ChangeCode) => {
    const status = STATUS_BY_CODE[code] ?? 400
    const extra = code === 'conflict' ? await snapshot(db) : {}
    return json({ error: code, ...extra }, { status })
  }

  switch (action) {
    case 'rename': {
      const result = await renameTag(db, tags, { name: textField(body.name), label: textField(body.label), rev }, who)
      return result.ok ? json({ ok: true, ...(await snapshot(db)) }) : fail(result.code)
    }
    case 'move': {
      const group = groupField(body.group)
      if (group === undefined) return json({ error: 'invalid' }, { status: 400 })
      const type = typeof body.type === 'string' ? body.type : undefined
      const result = await moveTag(db, tags, groups, { name: textField(body.name), type, group, index: indexField(body.index), rev }, who)
      return result.ok ? json({ ok: true, ...(await snapshot(db)) }) : fail(result.code)
    }
    case 'merge': {
      const intoRev = optionalRev(body.intoRev)
      if (intoRev === null) return json({ error: 'invalid' }, { status: 400 })
      const result = await mergeTag(db, tags, { name: textField(body.name), into: textField(body.into), rev, intoRev }, who)
      return result.ok ? json({ ok: true, ...(await snapshot(db)) }) : fail(result.code)
    }
    case 'alias': {
      const result = await aliasTag(db, tags, { name: textField(body.name), alias: textField(body.alias), rev }, who)
      return result.ok ? json({ ok: true, ...(await snapshot(db)) }) : fail(result.code)
    }
    case 'unalias': {
      const result = await unaliasTag(db, tags, groups, { alias: textField(body.alias) }, who)
      return result.ok ? json({ ok: true, ...(await snapshot(db)) }) : fail(result.code)
    }
    case 'name': {
      const subject = body.subject === 'group' ? 'group' : 'tag'
      const name = subject === 'group' ? String(idField(body.id) ?? '') : textField(body.name)
      const result = await nameTier(db, { tags, groups }, { subject, name, locale: textField(body.locale), label: textField(body.label), rev }, who)
      return result.ok ? json({ ok: true, ...(await snapshot(db)) }) : fail(result.code)
    }
    case 'group.create': {
      const result = await createGroup(db, groups, { type: textField(body.type), label: textField(body.label) }, who)
      return result.ok ? json({ ok: true, value: result.id, ...(await snapshot(db)) }) : fail(result.code)
    }
    case 'group.rename':
    case 'group.move':
    case 'group.delete': {
      const id = idField(body.id)
      if (!id) return json({ error: 'invalid' }, { status: 400 })
      const result = action === 'group.rename' ? await renameGroup(db, groups, { id, label: textField(body.label), rev }, who)
        : action === 'group.move' ? await moveGroup(db, groups, { id, type: typeof body.type === 'string' ? body.type : undefined, index: indexField(body.index), rev }, who)
        : await deleteGroup(db, groups, { id, rev }, who)
      return result.ok ? json({ ok: true, ...(await snapshot(db)) }) : fail(result.code)
    }
    case 'imply': {
      const result = await implyTag(db, tags, { name: textField(body.name), target: textField(body.target), rev }, who)
      return result.ok ? json({ ok: true, ...(await snapshot(db)) }) : fail(result.code)
    }
    case 'unimply': {
      const result = await unimplyTag(db, tags, { name: textField(body.name), target: textField(body.target), rev }, who)
      return result.ok ? json({ ok: true, ...(await snapshot(db)) }) : fail(result.code)
    }
    case 'delete': {
      const result = await deleteTag(db, tags, { name: textField(body.name), rev }, who)
      return result.ok ? json({ ok: true, ...(await snapshot(db)) }) : fail(result.code)
    }
    case 'undo': {
      const id = positiveId(String(body.id ?? ''))
      if (!id) return json({ error: 'invalid' }, { status: 400 })
      const result = await undoTagChange(db, { tags, groups }, id, who)
      return result.ok ? json({ ok: true, ...(await snapshot(db)) }) : fail(result.code)
    }
    default:
      return json({ error: 'invalid' }, { status: 400 })
  }
}
