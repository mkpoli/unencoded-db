import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { westernDate } from '../dates'
import { convertDate } from './hutime'
import { addSighting, createEntry, editSighting, getEntry, list, readSightingFields, restoreSighting } from './entries'
import { openTestDb } from './testdb'
import { createPerson } from './people'

const wanli = '明萬曆34年'
const bounds = { start: '1606-02-07', end: '1607-01-27', precision: 'year' }
const reply = (answer: (url: URL) => string) => (async (url: string) => new Response(answer(new URL(url)))) as typeof fetch

test('HuTime converts the dynasty-qualified year and verifies which dynasty actually answered', async () => {
  const answers = reply(url => {
    expect(url.searchParams.get('ical')).toBe('1005.1')
    expect(url.searchParams.get('iparam')).toBe('811')
    expect(url.searchParams.get('itype')).toBe('year')
    expect(url.searchParams.get('ival')).toBe(wanli)
    return url.searchParams.get('ocal') === '1005.1' ? '明 神宗 萬曆34年丙午 1月1日' : '1606-02-07 // 1607-01-27\r\n'
  })
  const reading = await convertDate('明萬曆三十四年', answers)
  expect(reading).toMatchObject(bounds)
  expect(new URL(reading!.query!).searchParams.get('ep')).toBe('be')
  expect(await convertDate('清萬曆34年', reply(url => url.searchParams.get('ocal') === '1005.1' ? '明 神宗' : '1606-02-07 // 1607-01-27'))).toBeNull()
})

test('leap months and day precision survive conversion, while ambiguous and failed answers stay undated', async () => {
  const day = await convertDate('日本元禄十五年閏八月初一日', reply(url => {
    expect(url.searchParams.get('ival')).toBe('元禄15年閏8月1日')
    expect(url.searchParams.get('itype')).toBe('date')
    return '1702-09-22\r\n'
  }))
  expect(day).toMatchObject({ start: '1702-09-22', end: '1702-09-22', precision: 'day' })
  expect(await convertDate('永平2年', reply(url => url.searchParams.get('ical') === '1005.1' ? '0059-02-02 // 0060-02-20 // 0509-02-05 // 0510-01-25' : ''))).toBeNull()
  expect(await convertDate(wanli, (async () => { throw new Error('offline') }) as unknown as typeof fetch)).toBeNull()
})

test('Western dates preserve precision, ranges and uncertainty, and validate the calendar cutover', () => {
  expect(westernDate('１９３９–１９４２')).toEqual({ start: '1939-01-01', end: '1942-12-31', precision: 'range' })
  expect(westernDate('1986-05-18至1989-08-18')).toEqual({ start: '1986-05-18', end: '1989-08-18', precision: 'range' })
  expect(westernDate('c. 980')).toMatchObject({ start: '0980-01-01', precision: 'year', approximate: true })
  expect(westernDate('1500年2月')).toMatchObject({ end: '1500-02-29', precision: 'month' })
  for (const text of ['1582-10-10', '1900-02-29', 'volume 1932', 'circa', '1939–1932']) expect(westernDate(text)).toBeNull()
})

test('the source, original and via keep their transcriptions across writes, restoration and a legacy reindex', async () => {
  const { raw, db } = openTestDb()
  const reading = JSON.stringify({ ...bounds, query: 'https://ap.hutime.org/cal/?method=conv' })
  raw.prepare('INSERT INTO date_readings VALUES (?, ?)').run(wanli, reading)
  const person = await createPerson(db)
  const who = { actor: person.id, ip: null }
  const form = new FormData()
  const long = '  原本の記載：' + '時期不詳'.repeat(20) + '  '
  form.set('place', 'Book')
  form.set('report_date', long)
  form.set('original_date', wanli)
  form.set('via_report_date', wanli)
  const fields = readSightingFields(form)
  const entry = await createEntry(db, { script: 'han', script_other: null, radical: null, strokes: null, claims: [], description: null }, fields, [], who)
  const seen = (await getEntry(db, entry))!.sightings[0]
  expect(seen).toMatchObject({ report_date: long, original_date: wanli, vias: [{ report_date: wanli }] })
  expect(raw.query('SELECT year FROM sources WHERE report_date = ?').get(wanli)).toEqual({ year: 1606 })
  expect(await list(db, { order: 'earliest' })).toMatchObject({ tiles: [{ id: entry, firstYear: '1606' }] })
  const snap = raw.query("SELECT snapshot FROM revisions WHERE kind = 'sighting'").get() as { snapshot: string }
  expect(JSON.parse(snap.snapshot)).toMatchObject({ report_date: long, original_date: wanli })
  await editSighting(db, seen.id, 1, { ...fields, original_date: null, report_date: null }, null, who, null, entry)
  expect((await getEntry(db, entry))!.entry.first_year).toBeNull()
  await addSighting(db, entry, { ...fields, original_date: null, report_date: '1935' }, [], who)
  await restoreSighting(db, entry, seen.id, 2, fields, who, 1)
  const sql = readFileSync(new URL('../../../scripts/reindex-dates.sql', import.meta.url), 'utf8')
  raw.exec("UPDATE entries SET first_year = '1935', first_year_kind = 'report', first_sighting = NULL")
  raw.exec(sql)
  raw.exec(sql)
  expect((await getEntry(db, entry))!.entry).toMatchObject({ first_year: '1606', first_year_kind: 'original', first_sighting: seen.id })
  expect(raw.query("SELECT tag, n FROM tag_counts WHERE tag GLOB 'y:*'").all()).toEqual([{ tag: 'y:1600', n: 1 }])
})
