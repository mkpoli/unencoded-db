// Record IDs start at one. Leave holes for withdrawn records so existing text keeps its meaning.
export function privateCode(id: number) {
  let offset = id - 1
  for (const [start, end] of [[0xe000, 0xf8ff], [0xf0000, 0xffffd], [0x100000, 0x10fffd]]) {
    if (Number.isSafeInteger(offset) && offset >= 0 && offset <= end - start) return start + offset
    offset -= end - start + 1
  }
  throw new Error('Record ID exceeds Unicode private-use space')
}
