import { primaryIds } from '$lib/ids'

export const RELATION_KINDS = ['sound', 'meaning', 'glyph', 'usage', 'variant', 'not_variant', 'similar', 'uncertain'] as const
export type RelationKind = typeof RELATION_KINDS[number]

export type Relation = {
  id: number
  pair_id: string
  from_entry: number
  to_entry: number | null
  to_character: string
  kind: RelationKind
  evidence_id: number
  difference: string | null
  place: string
  year: string | null
}

export async function listRelations(db: D1Database, entryId: number): Promise<Relation[]> {
  const { results } = await db.prepare(`SELECT r.id, r.pair_id, r.from_entry, r.to_entry, r.to_character, r.kind, r.evidence_id, r.difference, e.place, e.year
    FROM relations r JOIN evidence e ON e.id = r.evidence_id WHERE r.from_entry = ? ORDER BY r.id`).bind(entryId).all<Relation>()
  return results
}

export async function addRelation(db: D1Database, from: number, toCharacter: string, kind: string, evidenceId: number, difference: string | null) {
  if (!RELATION_KINDS.includes(kind as RelationKind)) return null
  const evidence = await db.prepare('SELECT id FROM evidence WHERE id = ? AND entry_id = ?').bind(evidenceId, from).first<{ id: number }>()
  if (!evidence) return null
  const current = await db.prepare('SELECT script, ids FROM entries WHERE id = ?').bind(from).first<{ script: string; ids: string | null }>()
  if (!current) return null
  const target = await db.prepare('SELECT id FROM entries e WHERE e.visible = 1 AND (e.script = ? OR EXISTS (SELECT 1 FROM entry_ids x WHERE x.ids = ? AND x.entry_id = e.id)) LIMIT 1').bind(toCharacter, toCharacter).first<{ id: number }>()
  const pair = crypto.randomUUID(), now = new Date().toISOString()
  await db.prepare('INSERT INTO relations (pair_id, from_entry, to_entry, to_character, kind, evidence_id, difference, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(pair, from, target?.id ?? null, toCharacter, kind, evidenceId, difference, now).run()
  if (target) {
    await db.prepare('INSERT INTO relations (pair_id, from_entry, to_entry, to_character, kind, evidence_id, difference, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(pair, target.id, from, primaryIds(current.ids) || current.script, kind, evidenceId, difference, now).run()
  }
  return pair
}
