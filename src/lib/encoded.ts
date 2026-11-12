// What is known of an encoded character, read from the tables in the browser when a form first asks. A
// description match compares exact text, so it is a hint for the person adding a record.
import url from 'ids-input/data/babelstone-ids.tsv.gz?url'
import unihanUrl from '$lib/data/unihan-rs.tsv.gz?url'
import { factsOf, parseDescriptions, parseUnihan, type Descriptions } from './character-tables'

export type { CharacterFacts } from './character-tables'

let descriptions: Promise<Descriptions> | null = null
let unihan: Promise<Map<string, [string, string]>> | null = null

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
  descriptions ??= read(url).then(parseDescriptions)
  unihan ??= read(unihanUrl).then(parseUnihan)
  return factsOf(char, await descriptions, await unihan)
}
