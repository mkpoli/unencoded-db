// What is known of an encoded character, read from the tables in the browser when a form first asks. A
// description match compares exact text, so it is a hint for the person adding a record.
import url from 'ids-input/data/babelstone-ids.tsv.gz?url'
import { retrying } from './retrying'
import { factsOf, parseDescriptions, parseUnihan, unihanBlock, type Descriptions, type UnihanRow } from './character-tables'

export type { CharacterFacts } from './character-tables'

const unihan = new Map<string, Promise<Map<string, UnihanRow>>>()

async function read(address: string) {
  const response = await fetch(address)
  const compressed = response.headers.get('content-encoding') ? null : response.body!.pipeThrough(new DecompressionStream('gzip'))
  return compressed ? new Response(compressed).text() : response.text()
}

/** BabelStone's descriptions, read once; a read that failed is tried again by the next ask. */
export const describedTable = retrying<Descriptions>(() => read(url).then(parseDescriptions))

export async function characterFacts(char: string) {
  if ([...char].length !== 1) return null
  const table = describedTable()
  const block = unihanBlock(char)
  let rows = unihan.get(block)
  if (!rows) unihan.set(block, rows = fetch(`/unihan/${block}.tsv`).then(response => response.ok ? response.text() : '').then(parseUnihan))
  return factsOf(char, await table, await rows)
}
