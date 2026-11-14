// The blocks of unified and compatibility ideographs and the two ideographic planes, by number, so that
// a character counts the same whatever version of Unicode the runtime knows.
export const IDEOGRAPHS = [[0x3400, 0x4DBF], [0x4E00, 0x9FFF], [0xF900, 0xFAFF], [0x20000, 0x3FFFF]]
export const isIdeograph = (char: string) => { const point = char.codePointAt(0) ?? 0; return IDEOGRAPHS.some(([from, to]) => point >= from && point <= to) }
