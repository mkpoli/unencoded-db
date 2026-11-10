import { IDS_LENGTH_MAX, IDS_MAX, joinIds, splitIds } from '$lib/ids'

/** The descriptions submitted with a character, joined in entered order. */
export function readIds(form: FormData): string | null {
  if (!form.has('ids')) return null
  return joinIds(form.getAll('ids')
    .filter((value): value is string => typeof value === 'string')
    .flatMap(value => splitIds(value))
    .map(value => value.slice(0, IDS_LENGTH_MAX))
    .filter(Boolean)
    .slice(0, IDS_MAX))
}

/** The descriptions as submitted, before limits, for a form returned with errors. */
export function rawIds(form: FormData): string[] {
  return form.getAll('ids')
    .filter((value): value is string => typeof value === 'string')
    .map(value => value.normalize('NFC').trim())
    .filter(Boolean)
}

/** A field holds more descriptions than a record, or one longer than the field allows. */
export function idsInvalid(form: FormData): boolean {
  const values = form.getAll('ids')
  if (!values.length) return false
  let count = 0
  for (const value of values) {
    if (typeof value !== 'string') return true
    for (const sequence of splitIds(value)) {
      if (sequence.length > IDS_LENGTH_MAX) return true
      if (++count > IDS_MAX) return true
    }
  }
  return false
}
