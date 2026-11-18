export const QUOTATIONS_MAX = 24
export type Quotation = { text: string; locator: string | null }

// Older revisions have no quotations. A locator identifies the speaker, page or object within the source.
export function quotations(raw: string | null | undefined): Quotation[] {
  if (!raw) return []
  const value: unknown = JSON.parse(raw)
  if (!Array.isArray(value) || !value.every(q => q && typeof q.text === 'string' && (q.locator === null || typeof q.locator === 'string'))) {
    throw new Error('Invalid sighting quotations')
  }
  return value
}
