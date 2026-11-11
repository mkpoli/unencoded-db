import { analyze, parseComposition, type Composition } from '$lib/composition'
import { splitIds } from '$lib/ids'

/** The composition a submission chose for its descriptions, normalized, or null when it does not
 * name the first description or holds nothing to show. Parts and roles are stored together, so a
 * description parsed on one side and an editor's own parts on the other stay aligned. */
export function readComposition(form: FormData, ids: string | null): string | null {
  const value = form.get('composition')
  if (typeof value !== 'string') return null
  const parsed = parseComposition(value)
  const primary = splitIds(ids)[0]
  if (!parsed || !primary || parsed.ids !== primary) return null
  const analysis = analyze(primary, parsed)
  if (!analysis) return null
  const parts = analysis.parts.map(part => part.part)
  const roles = analysis.parts.map(part => part.role)
  if (!roles.some(Boolean) && !parsed.formation) return null
  const normalized: Composition = { ids: primary, parts, roles, formation: parsed.formation }
  return JSON.stringify(normalized)
}
