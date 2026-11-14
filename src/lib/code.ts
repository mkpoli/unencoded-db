// A record's public code. The stored id is a plain integer; it is written in hexadecimal as R+00A1 and
// spelled with the first sixteen characters of the 千字文 as digits, 天 for 0 through 張 for F: 天天盈地.
// Both forms have at least four digits and grow past them the way U+10000 does.
// Source: the 千字文 digit scheme was proposed by NGWU YOH in a chat message of 2026-11-14 (personal
// communication, unpublished), with the examples 0x0000 = 天天天天, 0xFFFF = 張張張張, 0xA1C2 = 盈地辰玄.
export const CODE_DIGITS = [...'天地玄黃宇宙洪荒日月盈昃辰宿列張']

const hex = (id: number) => id.toString(16).toUpperCase().padStart(4, '0')

export const recordCode = (id: number) => 'R+' + hex(id)
export const recordName = (id: number) => [...hex(id)].map(digit => CODE_DIGITS[parseInt(digit, 16)]).join('')
