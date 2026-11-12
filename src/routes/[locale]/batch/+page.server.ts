import { fail, redirect } from '@sveltejs/kit'
import { BATCH_ROWS_MAX } from '$lib/limits'
import { createEntry, readEntryFields, readSightingFields } from '$lib/server/entries'
import { chargeWrites, env, guardWrite, ipHash } from '$lib/server/guard'
import { writer } from '$lib/server/people'
import { uploadedImages } from '../../_submission.server'
import type { Actions } from './$types'

// Row 0 names no row.
const reject = <Values>(status: 400 | 429, error: string, values: Values, row = 0) => fail(status, { error, row, values })
const filled = (value: FormDataEntryValue | undefined) => value instanceof File && value.size > 0

export const actions: Actions = {
  // One source and one script, and a row for each character: `ids`, `row_note` and the picker's `image`,
  // `thumb` and `box` repeat once per row, so the nth of each belongs to the nth row. Each row is saved by
  // `createEntry`, as a single add is. The request has paid for one add in `guardWrite`; the other rows are
  // charged to the same allowance below, before anything is written, so a batch never gets past the rate
  // limit that the same characters added one at a time would meet.
  default: async (event) => {
    await guardWrite(event, 'ADDS')
    const form = await event.request.formData()
    const { fields: base } = readEntryFields(form), shared = readSightingFields(form)
    const ids = form.getAll('ids').map(String), notes = form.getAll('row_note').map(String)
    const files = form.getAll('image'), thumbs = form.getAll('thumb'), boxes = form.getAll('box')
    const count = Math.max(ids.length, notes.length, files.length)
    const typed = Array.from({ length: Math.min(count, BATCH_ROWS_MAX) }, (_, i) => ({ ids: ids[i] ?? '', note: notes[i] ?? '' }))
    const values = { script: base.script, script_other: base.script_other, ...shared, rows: typed }
    if (count > BATCH_ROWS_MAX) return reject(400, 'batchTooMany', values)
    // A row with nothing in it is skipped, so a spare row costs nothing.
    const chosen = typed.map((row, index) => ({ ...row, index, picture: filled(files[index]) })).filter(row => row.ids.trim() || row.note.trim() || row.picture)
    if (!chosen.length) return reject(400, 'batchRows', values)
    if (!shared.place) return reject(400, 'place', values)

    const rows = []
    for (const row of chosen) {
      const entry = new FormData()
      entry.set('script', base.script)
      if (base.script_other) entry.set('script_other', base.script_other)
      entry.set('ids', row.ids)
      const { fields, error } = readEntryFields(entry)
      if (error) return reject(400, error, values, row.index + 1)
      if (!row.picture && !shared.url) return reject(400, 'evidence', values, row.index + 1)
      rows.push({ ...row, fields })
    }
    if (!(await chargeWrites(event, 'ADDS', rows.length - 1))) return reject(429, 'slow', values)

    const { DB, MEDIA } = env(event)
    const pictures = []
    for (const row of rows) {
      const own = new FormData()
      if (row.picture) {
        own.set('image', files[row.index])
        if (thumbs.length === files.length) own.set('thumb', thumbs[row.index])
        if (boxes.length === files.length) own.set('box', boxes[row.index])
      }
      const media = await uploadedImages(own, MEDIA)
      if (media === 'invalid') return reject(400, 'image', values, row.index + 1)
      pictures.push(media)
    }

    const person = await writer(event, DB)
    const who = { actor: person.id, ip: await ipHash(event) }
    let first = 0
    for (const [i, row] of rows.entries()) {
      const id = await createEntry(DB, row.fields, { ...shared, note: row.note.trim() || shared.note }, pictures[i], who)
      first ||= id
    }
    redirect(303, `/${event.params.locale}/entry/${first}`)
  },
}
