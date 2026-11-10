import { analyze, parseComposition, serializeComposition } from '$lib/composition'
import { splitIds } from '$lib/ids'

/** The composition a submission chose for its descriptions, normalized, or null when it does not
 * name the first description. Tags belong to one sequence, so a changed description sends none. */
export function readComposition(form: FormData, ids: string | null): string | null {
  const value = form.get('composition')
  if (typeof value !== 'string') return null
  const parsed = parseComposition(value)
  const primary = splitIds(ids)[0]
  if (!parsed || !primary || parsed.ids !== primary) return null
  const analysis = analyze(primary, parsed)
  if (!analysis || analysis.parts.length < 2) return null
  return serializeComposition(primary, analysis.roles) || null
}
