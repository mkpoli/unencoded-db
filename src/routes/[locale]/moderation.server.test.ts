import { describe, expect, test } from 'bun:test'
import type { Database } from 'bun:sqlite'
import { createTestDatabase, d1Binding, insertEntry } from '../../test-support'
import { load as publicList } from './+page.server'
import { load as detail } from './entry/[id]/+page.server'
import { load as queue } from './moderate/+page.server'
import { GET as hideGet, POST as hide } from './moderate/[id]/hide/+server'
import { GET as restoreGet, POST as restore } from './moderate/[id]/restore/+server'

const EMAIL = 'mod@example.com'

function routeEvent(path: string, id: string, options: { origin?: string | null; db?: D1Database; moderator?: string | null; locale?: string } = {}) {
  const locale = options.locale ?? 'en'
  const url = new URL(`https://example.test${path}`)
  const headers = new Headers()
  if (options.origin !== null) headers.set('origin', options.origin ?? url.origin)
  const request = new Request(url, { method: 'POST', headers })
  return {
    params: { locale, id },
    request,
    url,
    platform: options.db ? { env: { DB: options.db } } : undefined,
    locals: { moderator: options.moderator === undefined ? EMAIL : options.moderator },
  } as any
}

function queueEvent(db: Database, options: { before?: number; locale?: string; moderator?: string | null } = {}) {
  const locale = options.locale ?? 'en'
  const url = new URL(`https://example.test/${locale}/moderate`)
  if (options.before !== undefined) url.searchParams.set('before', String(options.before))
  return {
    params: { locale },
    platform: { env: { DB: d1Binding(db) } },
    locals: { moderator: options.moderator === undefined ? EMAIL : options.moderator },
    url,
  } as any
}

function hideDirectly(db: Database, ...ids: number[]) {
  const statement = db.query("INSERT INTO moderation_audit (entry_id, action, moderator, created_at) VALUES (?, 'hide', ?, '2026-01-01T00:00:00.000Z')")
  for (const id of ids) statement.run(id, EMAIL)
}

describe('moderation routes', () => {
  test('denies transitions without a moderator identity', async () => {
    const db = createTestDatabase()
    try {
      const DB = d1Binding(db)
      const id = insertEntry(db)
      for (const handler of [hide, restore]) {
        const response = await handler(routeEvent(`/en/moderate/${id}/hide`, String(id), { db: DB, moderator: null }))
        expect(response.status).toBe(404)
      }
      expect(db.query('SELECT visible FROM entries WHERE id = ?').get(id)).toEqual({ visible: 1 })
      expect(db.query('SELECT count(*) AS n FROM moderation_audit').get()).toEqual({ n: 0 })
    } finally { db.close() }
  })

  test('hide and restore run through the audit insert and redirect to the locale queue', async () => {
    const db = createTestDatabase()
    try {
      const DB = d1Binding(db)
      const hidden = insertEntry(db, 1)
      const visible = insertEntry(db, 1)

      await expect(hide(routeEvent(`/en/moderate/${hidden}/hide`, String(hidden), { db: DB }))).rejects.toMatchObject({ status: 303, location: '/en/moderate' })
      expect(db.query('SELECT visible FROM entries WHERE id = ?').get(hidden)).toEqual({ visible: 0 })
      expect(db.query('SELECT visible FROM entries WHERE id = ?').get(visible)).toEqual({ visible: 1 })
      const row = db.query('SELECT entry_id, action, moderator, created_at FROM moderation_audit').get() as { entry_id: number; action: string; moderator: string; created_at: string }
      expect(row).toMatchObject({ entry_id: hidden, action: 'hide', moderator: EMAIL })
      expect(new Date(row.created_at).toISOString()).toBe(row.created_at)

      await expect(detail({ platform: { env: { DB } }, params: { locale: 'en', id: String(hidden) } } as any)).rejects.toMatchObject({ status: 404 })

      const queuePage = await queue(queueEvent(db)) as any
      expect(queuePage.entries.map((entry: { id: number }) => entry.id)).toEqual([hidden])

      await expect(restore(routeEvent(`/ja/moderate/${hidden}/restore`, String(hidden), { db: DB, locale: 'ja' }))).rejects.toMatchObject({ status: 303, location: '/ja/moderate' })
      expect(db.query('SELECT visible FROM entries WHERE id = ?').get(hidden)).toEqual({ visible: 1 })
      expect((await detail({ platform: { env: { DB } }, params: { locale: 'en', id: String(hidden) } } as any) as any).entry.id).toBe(hidden)
      expect(db.query('SELECT action FROM moderation_audit ORDER BY id').all()).toEqual([{ action: 'hide' }, { action: 'restore' }])
    } finally { db.close() }
  })

  test('returns 409 when the entry is already in the requested state', async () => {
    const db = createTestDatabase()
    try {
      const DB = d1Binding(db)
      const id = insertEntry(db, 1)

      await expect(hide(routeEvent(`/en/moderate/${id}/hide`, String(id), { db: DB }))).rejects.toMatchObject({ status: 303, location: '/en/moderate' })
      await expect(hide(routeEvent(`/en/moderate/${id}/hide`, String(id), { db: DB }))).rejects.toMatchObject({ status: 409 })
      expect(db.query('SELECT count(*) AS count FROM moderation_audit').get()).toEqual({ count: 1 })

      await expect(restore(routeEvent(`/en/moderate/${id}/restore`, String(id), { db: DB }))).rejects.toMatchObject({ status: 303, location: '/en/moderate' })
      await expect(restore(routeEvent(`/en/moderate/${id}/restore`, String(id), { db: DB }))).rejects.toMatchObject({ status: 409 })
      expect(db.query('SELECT count(*) AS count FROM moderation_audit').get()).toEqual({ count: 2 })
    } finally { db.close() }
  })

  test('returns 403 for a missing or cross-origin Origin', async () => {
    const db = createTestDatabase()
    try {
      const DB = d1Binding(db)
      const id = insertEntry(db, 1)

      const crossOrigin = await hide(routeEvent(`/en/moderate/${id}/hide`, String(id), { db: DB, origin: 'https://evil.test' }))
      expect(crossOrigin.status).toBe(403)
      const missing = await hide(routeEvent(`/en/moderate/${id}/hide`, String(id), { db: DB, origin: null }))
      expect(missing.status).toBe(403)
      expect(db.query('SELECT visible FROM entries WHERE id = ?').get(id)).toEqual({ visible: 1 })
      expect(db.query('SELECT count(*) AS count FROM moderation_audit').get()).toEqual({ count: 0 })
    } finally { db.close() }
  })

  test('rejects GET with 405', async () => {
    for (const handler of [hideGet, restoreGet]) {
      const response = await handler(routeEvent('/en/moderate/1/hide', '1') as any) as Response
      expect(response.status).toBe(405)
      expect(response.headers.get('allow')).toBe('POST')
    }
  })

  test('returns 404 for invalid ids and unauthenticated callers', async () => {
    const db = createTestDatabase()
    try {
      const DB = d1Binding(db)
      const id = insertEntry(db, 1)
      for (const bad of ['0', 'abc', '1.5', '-1', '9007199254740992']) {
        await expect(hide(routeEvent('/en/moderate/x/hide', bad, { db: DB }))).rejects.toMatchObject({ status: 404 })
      }
      const anonymous = await hide(routeEvent(`/en/moderate/${id}/hide`, String(id), { db: DB, moderator: null }))
      expect(anonymous.status).toBe(404)
      expect(db.query('SELECT visible FROM entries WHERE id = ?').get(id)).toEqual({ visible: 1 })
    } finally { db.close() }
  })

  test('rejects an unknown locale prefix', async () => {
    const db = createTestDatabase()
    try {
      const id = insertEntry(db, 1)
      await expect(hide(routeEvent(`/fr/moderate/${id}/hide`, String(id), { db: d1Binding(db), locale: 'fr' }))).rejects.toMatchObject({ status: 404 })
      expect(db.query('SELECT visible FROM entries WHERE id = ?').get(id)).toEqual({ visible: 1 })
    } finally { db.close() }
  })

  test('lists only hidden entries, newest first, with a bounded keyset cursor', async () => {
    const db = createTestDatabase()
    try {
      const ids = Array.from({ length: 25 }, () => insertEntry(db, 1))
      hideDirectly(db, ...ids.slice(0, 22))

      const first = await queue(queueEvent(db)) as any
      expect(first.entries).toHaveLength(20)
      expect(first.entries.map((entry: { id: number }) => entry.id)).toEqual(ids.slice(2, 22).reverse())
      expect(first.next).toBe(ids[2])

      const second = await queue(queueEvent(db, { before: first.next, locale: 'ja' })) as any
      expect(second.entries.map((entry: { id: number }) => entry.id)).toEqual([ids[1], ids[0]])
      expect(second.next).toBeNull()

      const visibleIds = new Set(ids.slice(22))
      expect(first.entries.every((entry: { id: number }) => !visibleIds.has(entry.id))).toBe(true)
      expect(first.moderator).toBe(EMAIL)
    } finally { db.close() }
  })

  test('returns an empty queue and requires a moderator', async () => {
    const db = createTestDatabase()
    try {
      insertEntry(db, 1)
      expect((await queue(queueEvent(db)) as any).entries).toEqual([])
      await expect(queue(queueEvent(db, { moderator: null }))).rejects.toMatchObject({ status: 404 })
    } finally { db.close() }
  })

  test('keeps hidden entries out of public listings and detail pages', async () => {
    const db = createTestDatabase()
    try {
      const first = insertEntry(db, 1)
      const hidden = insertEntry(db, 1)
      const last = insertEntry(db, 1)
      hideDirectly(db, hidden)

      const listing = await publicList({ platform: { env: { DB: d1Binding(db) } }, url: new URL('https://example.test/en') } as any) as any
      expect(listing.entries.map((entry: { id: number }) => entry.id)).toEqual([last, first])
      expect(listing.entries.some((entry: { id: number }) => entry.id === hidden)).toBe(false)
      await expect(detail({ platform: { env: { DB: d1Binding(db) } }, params: { locale: 'en', id: String(hidden) } } as any)).rejects.toMatchObject({ status: 404 })
    } finally { db.close() }
  })

  test('marks an entry page for moderation only when a moderator is present', async () => {
    const db = createTestDatabase()
    try {
      const id = insertEntry(db, 1)
      const anonymous = await detail({ platform: { env: { DB: d1Binding(db) } }, params: { locale: 'en', id: String(id) }, locals: { moderator: null } } as any) as any
      expect(anonymous.isModerator).toBe(false)
      const moderator = await detail({ platform: { env: { DB: d1Binding(db) } }, params: { locale: 'en', id: String(id) }, locals: { moderator: EMAIL } } as any) as any
      expect(moderator.isModerator).toBe(true)
    } finally { db.close() }
  })
})
