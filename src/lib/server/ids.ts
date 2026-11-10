import { cleanIds, IDS_LENGTH_MAX, IDS_MAX, joinIds } from '$lib/ids'

/** The descriptions submitted with a character, joined in entered order. */
export function readIds(form: FormData): string | null {
  if (!form.has('ids')) return null
  return joinIds(form.getAll('ids')
    .filter((value): value is string => typeof value === 'string')
    .flatMap(value => value.split(/\s+/u))
    .map(value => cleanIds(value).slice(0, IDS_LENGTH_MAX))
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

/** A field holds more than one description, or a description longer than the field allows. */
export function idsInvalid(form: FormData): boolean {
  const values = form.getAll('ids')
  if (!values.length) return false
  let count = 0
  for (const value of values) {
    if (typeof value !== 'string') return true
    for (const part of value.split(/\s+/u)) {
      const sequence = cleanIds(part)
      if (!sequence) continue
      if (sequence.length > IDS_LENGTH_MAX) return true
      if (++count > IDS_MAX) return true
    }
  }
  return false
}
