// Whether a description sequence is the description of an encoded character, from the BabelStone IDS table that
// ids-input carries. It compares exact text, so a match is a hint for the person adding a record.
import url from 'ids-input/data/babelstone-ids.tsv.gz?url'

let table: Promise<Map<string, string>> | null = null

async function load() {
  const response = await fetch(url)
  const compressed = response.headers.get('content-encoding') ? null : response.body!.pipeThrough(new DecompressionStream('gzip'))
  const text = compressed ? await new Response(compressed).text() : await response.text()
  const map = new Map<string, string>()
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const [char, sequences] = line.split('\t')
    for (const sequence of sequences?.split(' ') ?? []) {
      const plain = sequence.replace(/\([^)]*\)$/, '').replace(/^〾/, '')
      if (!map.has(plain)) map.set(plain, char)
    }
  }
  return map
}

export async function encodedMatch(ids: string) {
  table ??= load()
  return (await table).get(ids) ?? null
}
