// Existing root pages and language codes start with lowercase letters. The first digit of
// a record code uses the complementary alphabet, with the full alphabet available afterward.
const INITIAL = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const DIGITS = `${INITIAL}abcdefghijklmnopqrstuvwxyz`

export function shortRecordCode(id: number) {
  let rank = id - 1
  let tail = ''
  // Assign every shorter code before extending the length by one character.
  while (rank >= INITIAL.length) {
    rank -= INITIAL.length
    tail = DIGITS[rank % DIGITS.length] + tail
    rank = Math.floor(rank / DIGITS.length)
  }
  return INITIAL[rank] + tail
}

export function readShortRecordCode(code: string) {
  if (!/^[0-9A-Z][0-9A-Za-z]{0,9}$/.test(code)) return null
  let rank = INITIAL.indexOf(code[0])
  for (const digit of code.slice(1)) {
    rank = rank * DIGITS.length + INITIAL.length + DIGITS.indexOf(digit)
  }
  const id = rank + 1
  return Number.isSafeInteger(id) ? id : null
}
