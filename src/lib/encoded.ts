// What is known of an encoded character, read from the tables in the browser when a form first asks. A
// description match compares exact text, so it is a hint for the person adding a record.
import url from 'ids-input/data/babelstone-ids.tsv.gz?url'
import { factsOf, parseDescriptions, parseUnihan, unihanBlock, type Descriptions, type UnihanRow } from './character-tables'

export type { CharacterFacts } from './character-tables'

let descriptions: Promise<Descriptions> | null = null
const unihan = new Map<string, Promise<Map<string, UnihanRow>>>()

async function read(address: string) {
  const response = await fetch(address)
  const compressed = response.headers.get('content-encoding') ? null : response.body!.pipeThrough(new DecompressionStream('gzip'))
  return compressed ? new Response(compressed).text() : response.text()
}

export async function encodedMatch(ids: string) {
  descriptions ??= read(url).then(parseDescriptions)
  return (await descriptions).encoded.get(ids) ?? null
}

export async function characterFacts(char: string) {
  if ([...char].length !== 1) return null
  descriptions ??= read(url).then(parseDescriptions)
  const block = unihanBlock(char)
  let rows = unihan.get(block)
  if (!rows) unihan.set(block, rows = fetch(`/unihan/${block}.tsv`).then(response => response.ok ? response.text() : '').then(parseUnihan))
  return factsOf(char, await descriptions, await rows)
}
