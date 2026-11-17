import { json } from '@sveltejs/kit'
import { env, guardWrite, ipHash } from '$lib/server/guard'
import { writer } from '$lib/server/people'
import {
  createTag,
  deleteTag,
  implyTag,
  renameTag,
  retypeTag,
  tagChanges,
  tagList,
  undoTagChange,
  unimplyTag,
  type ChangeCode,
} from '$lib/server/tags'
import { positiveId } from '../../_submission.server'
import type { RequestHandler } from './$types'

const STATUS_BY_CODE: Partial<Record<ChangeCode, number>> = {
  conflict: 409,
  exists: 409,
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

async function snapshot(db: D1Database) {
  const [tags, changes] = await Promise.all([tagList(db, true), tagChanges(db)])
  return { tags, changes }
}

export const GET: RequestHandler = async (event) => {
  const db = env(event).DB
  const used = event.url.searchParams.has('used')
  const [tags, changes] = await Promise.all([tagList(db, used), tagChanges(db)])
  return json({ tags, changes })
}

export const POST: RequestHandler = async (event) => {
  await guardWrite(event, 'ADDS')
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
  const tags = await tagList(db)
  const person = await writer(event, db)
  const who = { actor: person.id, ip: await ipHash(event) }
  const action = textField(body.action)

  if (action === 'create') {
    const implies = Array.isArray(body.implies)
      ? body.implies.filter((item): item is string => typeof item === 'string')
      : []
    const result = await createTag(
      db,
      tags,
      { name: textField(body.name), type: typeof body.type === 'string' ? body.type : undefined, implies },
      who,
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
    case 'retype': {
      const result = await retypeTag(db, tags, { name: textField(body.name), type: textField(body.type), rev }, who)
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
      const result = await undoTagChange(db, tags, id, who)
      return result.ok ? json({ ok: true, ...(await snapshot(db)) }) : fail(result.code)
    }
    default:
      return json({ error: 'invalid' }, { status: 400 })
  }
}
