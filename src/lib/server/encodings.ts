import { cleanEncodingCode, OTHER_ENCODING, type Encoding } from '$lib/encodings'

const MAX_ENCODINGS = 20
const CODE_MAX = 80
const CHARSET_MAX = 80

/**
 * The encodings submitted with a character. A form without the repeatable fields
 * falls back to the old single `encoded_as` value.
 */
export function parseEncodings(form: FormData): Encoding[] | null {
  const charsets = form.getAll('encoding_charset')
  const codes = form.getAll('encoding_code')
  const others = form.getAll('encoding_charset_other')
  if (!charsets.length && !codes.length) {
    const legacy = typeof form.get('encoded_as') === 'string' ? cleanEncodingCode(String(form.get('encoded_as'))) : ''
    if (!legacy) return []
    return legacy.length <= CODE_MAX ? [{ charset: 'unicode', code: legacy }] : null
  }
  if (charsets.length !== codes.length || charsets.length > MAX_ENCODINGS) return null
  const out: Encoding[] = []
  const seen = new Set<string>()
  for (let i = 0; i < charsets.length; i++) {
    const rawCharset = typeof charsets[i] === 'string' ? String(charsets[i]).normalize('NFC').trim() : ''
    const rawCode = typeof codes[i] === 'string' ? cleanEncodingCode(String(codes[i])) : ''
    if (!rawCode) continue
    if (!rawCharset) return null
    const custom = rawCharset === OTHER_ENCODING && typeof others[i] === 'string' ? String(others[i]).normalize('NFC').trim() : ''
    const charset = rawCharset === OTHER_ENCODING ? custom : rawCharset
    if (!charset || charset.length > CHARSET_MAX || rawCode.length > CODE_MAX) return null
    const key = `${charset}\u0000${rawCode}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ charset, code: rawCode })
  }
  return out
}

export async function listEncodings(db: D1Database, entryId: number): Promise<Encoding[]> {
  const { results } = await db.prepare('SELECT charset, code FROM entry_encodings WHERE entry_id = ? ORDER BY rowid').bind(entryId).all<Encoding>()
  return results
}

export async function addEncodings(db: D1Database, entryId: number, encodings: Encoding[]) {
  for (const encoding of encodings) {
    await db.prepare('INSERT OR IGNORE INTO entry_encodings (entry_id, charset, code, created_at) VALUES (?, ?, ?, ?)')
      .bind(entryId, encoding.charset, encoding.code, new Date().toISOString()).run()
  }
}

export async function saveEncodings(db: D1Database, entryId: number, encodings: Encoding[]) {
  await db.prepare('DELETE FROM entry_encodings WHERE entry_id = ?').bind(entryId).run()
  await addEncodings(db, entryId, encodings)
}

/** The code kept in the old single column: the Unicode encoding, or the first one. */
export function primaryEncoding(encodings: Encoding[]): string | null {
  return encodings.find(encoding => encoding.charset === 'unicode')?.code ?? encodings[0]?.code ?? null
}
