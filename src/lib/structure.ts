// The structures of a description, as the keys a record is found by. Every operator of a description
// gives a key for the operator alone (⿲), one for the whole of what it joins (⿰氵五), and one for each way
// of leaving some of its parts open (⿰氵？, ⿰？五), so a search for a structure reads one row and never the
// descriptions themselves. A structure typed to search with is read into the same keys.
// Nothing here touches the network or the page, so it runs in the browser, on the server and in tests.
import { isNode, parse, unalias, type IdsPart } from 'ids-input'
import { radicalEquivalent } from './radicals'
import { treeOf, write, type Tree } from './similar'

/** The part of a key that stands for any part. */
export const OPEN = '？'
/** Keys at most for one description: the outermost structures are kept. */
export const STRUCTURE_KEYS_MAX = 160
/** Keys at most that one structure typed to search with is read into. */
export const PATTERN_KEYS_MAX = 6

const OPERATOR = /^[⿰-⿿㇯〾]$/u
/** Whether a character is an operator of a description. */
export const isOperator = (char: string | undefined) => char !== undefined && OPERATOR.test(char)

/** The keys of every structure in a description, outermost first. A text that is no description gives its operators. */
export function structureKeys(ids: string): string[] {
  const keys = new Set<string>()
  const tree = treeOf(ids)
  if (!tree) for (const char of ids) if (isOperator(char)) keys.add(char)
  const waiting: Tree[] = tree ? [tree] : []
  for (let at = 0; at < waiting.length; at++) {
    const node = waiting[at]
    if (typeof node === 'string') continue
    keys.add(node.op)
    const texts = node.parts.map(part => write(part))
    // Overlaid parts are written in either order.
    for (const order of node.op === '⿻' && texts.length === 2 ? [texts, [texts[1], texts[0]]] : [texts]) {
      for (let open = 0; open < (1 << order.length) - 1; open++) {
        const parts = order.map((text, index) => open >> index & 1 ? OPEN : text)
        if (parts.some(part => part !== OPEN)) keys.add(node.op + parts.join(''))
      }
    }
    waiting.push(...node.parts)
  }
  return [...keys].slice(0, STRUCTURE_KEYS_MAX)
}

/** The parts of a description: its characters other than the operators and spaces, radical code points as the ideographs they stand for. */
export const partsOf = (ids: string) => [...new Set([...ids].filter(char => !/[\s\u2FF0-\u2FFF\u31EF]/u.test(char)).map(radicalEquivalent))]
/** The rows a record is found by for a description it states: one for each part, then one for each structure. */
export const partRowsOf = (ids: string) => [...new Set([...partsOf(ids), ...structureKeys(ids)])].map(key => `p:${key}`)

type Pattern = null | string | { op: string; parts: Pattern[] }
// A part left open reads as null, as a missing one does.
const patternOf = (part: IdsPart | undefined): Pattern => part === null || part === undefined || part === OPEN || part === '⬚' || part === '＋' ? null : isNode(part) ? { op: part.op, parts: part.parts.map(patternOf) } : part
const isOpen = (pattern: Pattern): boolean => pattern === null || (typeof pattern !== 'string' && pattern.parts.some(isOpen))
const written = (pattern: Pattern): string => pattern === null ? OPEN : typeof pattern === 'string' ? pattern : pattern.op + pattern.parts.map(written).join('')

function patternKeys(pattern: Pattern, keys: string[]) {
  if (pattern === null || typeof pattern === 'string') return
  const shut = pattern.parts.filter(part => !isOpen(part))
  keys.push(shut.length ? pattern.op + pattern.parts.map(part => isOpen(part) ? OPEN : written(part)).join('') : pattern.op)
  for (const part of pattern.parts) if (part !== null && isOpen(part)) patternKeys(part, keys)
}

// A part left open is written ？, ⬚ or ＋ in a description, and ? or * on a keyboard.
const opened = (text: string) => text.replace(/[?*＊]/gu, OPEN)

// Operators named in capitals (LR氵五) are read only in a term that starts with a name and names its parts by
// characters: a word in Latin letters alone (OUP, XXI, LD50) stays a word.
function named(typed: string) {
  if (!/^[A-Z]{2}/.test(typed) || !/[^\x00-\x7F]/u.test(typed)) return typed
  const read = unalias(typed)
  return /[A-Za-z0-9]/.test(read) ? typed : read
}

/**
 * The keys a structure typed to search with is found by, every one of which a record must hold: ⿲ is the
 * operator, ⿰氵 is ⿰氵？, and ⿰氵⿱？木 is ⿰氵？ with ⿱？木. Operators may be typed by their names in capitals
 * before parts (LR氵五). The text is read as a description is filed, by the same parser. Null for a text that
 * does not start with an operator, or holds more than its operators join.
 */
export function structurePattern(text: string): string[] | null {
  const typed = text.normalize('NFC').replace(/\s+/gu, '')
  const term = [...opened(named(typed))].map(radicalEquivalent).join('')
  if (!isOperator([...term][0])) return null
  const read = parse(term, { open: true })
  if (read.problem || !isNode(read.tree)) return null
  const keys: string[] = []
  patternKeys(patternOf(read.tree), keys)
  const unique = [...new Set(keys)]
  return unique.length && unique.length <= PATTERN_KEYS_MAX ? unique : null
}
