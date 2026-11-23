import { catalogueTitleReadings } from './catalogue-title-readings'
import { executeD1, importD1 } from './d1'

const [where] = process.argv.slice(2)
if (where !== '--local' && where !== '--remote') throw new Error('usage: bun scripts/sweep-title-readings.ts --local|--remote')
const literal = (text: string) => `CAST(X'${Buffer.from(text).toString('hex')}' AS TEXT)`
let after = '', titles = 0, changed = 0
for (;;) {
  const query = `SELECT s.title,
    (SELECT json_group_array(json_array(r.lookup,r.spelling,r.generated))
      FROM source_title_readings r WHERE r.title = s.title) AS readings
    FROM sources s WHERE s.records > 0 AND s.title > ${literal(after)}
    GROUP BY s.title ORDER BY s.title LIMIT 64`
  const page: { title: string; readings: string }[] = JSON.parse(executeD1(where, '--json', '--command', query))[0].results
  if (!page.length) break
  const readings = page.map(row => JSON.parse(row.readings) as [string, string, number][])
  const generated = await catalogueTitleReadings(page.map(row => row.title),
    readings.map(names => names.filter(([, , automatic]) => !automatic).map(([, spelling]) => spelling)))
  const statements: string[] = []
  for (const [i, row] of page.entries()) {
    const title = literal(row.title)
    const desired = generated[i]
    for (const [key, spelling, automatic] of readings[i]) {
      if (!automatic || desired.get(key) === spelling) desired.delete(key)
      else if (!desired.has(key)) statements.push(`DELETE FROM source_title_readings WHERE title = ${title} AND lookup = ${literal(key)} AND generated = 1;`)
    }
    for (const [key, spelling] of desired) {
      statements.push(`INSERT INTO source_title_readings(title,lookup,spelling,generated) VALUES (${title},${literal(key)},${literal(spelling)},1)
        ON CONFLICT(lookup,title) DO UPDATE SET spelling = excluded.spelling WHERE source_title_readings.generated = 1;`)
    }
  }
  if (statements.length) importD1(where, statements.join('\n'))
  after = page[page.length - 1].title
  titles += page.length
  changed += statements.length
}
// A title can disappear through a correction, a merge, or a hidden sighting.
executeD1(where, '--command', `DELETE FROM source_title_readings WHERE generated = 1 AND NOT EXISTS (
  SELECT 1 FROM sources WHERE records > 0 AND sources.title = source_title_readings.title)`)
console.log(`Checked ${titles} source titles, reconciled ${changed} search spellings.`)
