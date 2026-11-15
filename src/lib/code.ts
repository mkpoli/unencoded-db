// A record's public code. The stored id is a plain integer; it is written in hexadecimal as R+00A1 and
// spelled with the first sixteen characters of the 千字文 as digits, 天 for 0 through 張 for F: 天天盈地.
// Both forms have at least four digits and grow past them the way U+10000 does.
// Source: the 千字文 digit scheme was proposed by NGWU YOH in a chat message of 2026-11-14 (personal
// communication, unpublished), with the examples 0x0000 = 天天天天, 0xFFFF = 張張張張, 0xA1C2 = 盈地辰玄.
export const CODE_DIGITS = [...'天地玄黃宇宙洪荒日月盈昃辰宿列張']

const hex = (id: number) => id.toString(16).toUpperCase().padStart(4, '0')

export const recordCode = (id: number) => 'R+' + hex(id)
export const recordName = (id: number) => [...hex(id)].map(digit => CODE_DIGITS[parseInt(digit, 16)]).join('')

// The forms a reader types for 黃 and 張 where the script writes them otherwise.
const TYPED: Record<string, string> = { 黄: '黃', 张: '張' }

// The id a typed code names, in either spelling, or null for text that is no code in its written form.
export function parseRecordCode(text: string) {
  const typed = text.normalize('NFKC').trim()
  // A plus sign written bare in an address arrives as a space.
  const digits = /^r[+ ][0-9a-f]{4,8}$/i.test(typed)
    ? typed.slice(2)
    : [...typed].map(char => CODE_DIGITS.indexOf(TYPED[char] ?? char)).map(digit => digit < 0 ? '?' : digit.toString(16)).join('')
  if (!/^[0-9a-f]{4,8}$/i.test(digits)) return null
  const id = parseInt(digits, 16)
  return id > 0 && hex(id) === digits.toUpperCase() ? id : null
}
