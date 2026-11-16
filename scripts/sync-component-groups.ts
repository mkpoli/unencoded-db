// Writes src/lib/data/component-groups.json from han-input's variants.json.gz (app/public/data), which it
// builds from IWDS (https://github.com/yi-bai/iwds). Only the `component` map is kept: each component to the
// ids of the unifiable groups it belongs to. Run: bun scripts/sync-component-groups.ts <path to variants.json.gz>
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'

const source = process.argv[2]
if (!source) throw new Error('usage: bun scripts/sync-component-groups.ts <path to han-input variants.json.gz>')
const data = JSON.parse(gunzipSync(readFileSync(source)).toString('utf8')) as {
  sources: unknown[]
  component: Record<string, { component: string; group: string }[]>
}
const groups: Record<string, string[]> = {}
for (const [component, mates] of Object.entries(data.component)) groups[component] = [...new Set(mates.map(mate => mate.group))]
const out = `{\n  "sources": ${JSON.stringify(data.sources)},\n  "groups": {\n${Object.entries(groups).sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, ids]) => `    ${JSON.stringify(key)}: ${JSON.stringify(ids)}`).join(',\n')}\n  }\n}\n`
writeFileSync(join(import.meta.dir, '../src/lib/data/component-groups.json'), out)
console.log(`${Object.keys(groups).length} components`)
