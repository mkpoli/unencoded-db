export type Sense = { id?: number; gloss: string; reading: string | null; evidence_id?: number | null }

export function parseSenses(form: FormData): Sense[] | null {
  const glosses = form.getAll('sense_gloss'), readings = form.getAll('sense_reading')
  const count = Math.max(glosses.length, readings.length)
  if (count > 10) return null
  const out: Sense[] = []
  for (let i = 0; i < count; i++) {
    const rawGloss = glosses[i], rawReading = readings[i]
    const gloss = typeof rawGloss === 'string' ? rawGloss.normalize('NFC').trim() : ''
    const reading = typeof rawReading === 'string' ? rawReading.normalize('NFC').trim() : ''
    if (!gloss && !reading) continue
    if (gloss.length > 500 || reading.length > 200) return null
    out.push({ gloss, reading: reading || null })
  }
  return out
}

export async function listSenses(db: D1Database, entryId: number): Promise<Sense[]> {
  const { results } = await db.prepare('SELECT id, gloss, reading, evidence_id FROM senses WHERE entry_id = ? ORDER BY id').bind(entryId).all<Sense>()
  return results
}

export async function saveSenses(db: D1Database, entryId: number, senses: Sense[], evidenceId: number | null) {
  const now = new Date().toISOString()
  for (const sense of senses) {
    await db.prepare('INSERT INTO senses (entry_id, gloss, reading, evidence_id, created_at) VALUES (?, ?, ?, ?, ?)').bind(entryId, sense.gloss, sense.reading, evidenceId, now).run()
  }
}
