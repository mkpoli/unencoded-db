import { invalidateAll } from '$app/navigation'
import { t } from '$lib/t'

// The records the current person has starred, seeded from layout data in the browser and updated
// optimistically when the star button is toggled.
const state = $state<{ ids: Set<number>; user: string | null; ready: boolean }>({
  ids: new Set(),
  user: null,
  ready: false,
})
// Stars being saved, which a read or layout sync landing meanwhile must not undo.
const pending = new Map<number, boolean>()
// Saves finished so far; a read that a save overtook is read again.
let saved = 0
let lastSyncedUser: string | null | undefined = undefined
let lastSyncedIds = ''

export const isFavourite = (id: number) => state.ids.has(id)
export const favouritesReady = () => state.ready

function applyIds(base: Iterable<number>) {
  const ids = new Set(base)
  for (const [entry, favourite] of pending) {
    if (favourite) ids.add(entry)
    else ids.delete(entry)
  }
  state.ids = ids
}

/** Syncs client state from the server-provided layout data when the person or server list changes. */
export function syncFavourites(userId: string | null, serverIds: readonly number[]) {
  const key = serverIds.join(',')
  if (userId === lastSyncedUser && key === lastSyncedIds && state.ready) return
  lastSyncedUser = userId
  lastSyncedIds = key
  state.user = userId
  state.ready = true
  applyIds(userId ? serverIds : [])
}

async function read(userId: string) {
  const before = saved
  try {
    const response = await fetch('/api/favourites')
    if (!response.ok || state.user !== userId) return
    const data = await response.json() as { ids?: number[] }
    if (saved !== before) return read(userId)
    applyIds(data.ids ?? [])
  } catch { /* A later navigation reads them again. */ }
}

/** Reads the person's stars from the API when not already held. */
export async function loadFavourites(userId: string | null) {
  if (userId === state.user && state.ready) return
  state.user = userId
  state.ready = true
  if (!userId) { state.ids = new Set(); return }
  await read(userId)
}

/** Stars a record or removes its star, starting an anonymous session on first write if needed. */
export async function setFavourite(id: number, favourite: boolean) {
  const hadUser = state.user !== null
  const next = new Set(state.ids)
  if (favourite) next.add(id)
  else next.delete(id)
  state.ids = next
  state.ready = true
  pending.set(id, favourite)
  try {
    const response = await fetch('/api/favourites', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entry: id, favourite }),
    })
    if (!response.ok) {
      const value = await response.json().catch(() => ({})) as { message?: string }
      if (response.status === 503) throw new Error(t('error.paused'))
      if (response.status === 429 && !value.message) throw new Error(t('error.slow'))
      if (response.status === 403 && !value.message) throw new Error(t('error.banned'))
      throw new Error(value.message || response.statusText)
    }
    const body = await response.json().catch(() => null) as { entry?: number; favourite?: boolean } | null
    if (body && typeof body.entry === 'number' && body.entry !== id) {
      const updated = new Set(state.ids)
      updated.delete(id)
      if (body.favourite) updated.add(body.entry)
      state.ids = updated
    }
  } catch (error) {
    const reverted = new Set(state.ids)
    if (favourite) reverted.delete(id)
    else reverted.add(id)
    state.ids = reverted
    throw error
  } finally {
    pending.delete(id)
    saved++
  }
  if (!hadUser && !pending.size) await invalidateAll()
}
