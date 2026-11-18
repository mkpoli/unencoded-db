import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { westernDate } from '../dates'
import { convertDate } from './hutime'
import { addSighting, createEntry, editEntry, editSighting, getEntry, list, readSightingFields, redactRevision, restoreSighting } from './entries'
import { prepareDates } from './date-readings'
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
    expect(url.searchParams.get('ival')).toBe('萬曆34年')
    return url.searchParams.get('ocal') === '1005.1' ? '明 神宗 萬曆34年丙午 1月1日' : '1606-02-07 // 1607-01-27\r\n'
  })
  expect(await convertDate('明萬曆34年（1606）', answers)).toMatchObject(bounds)
  expect(await convertDate('明萬曆34年（1634）', answers)).toBeNull()
  expect(await convertDate('1606（明萬曆34年）', answers)).toMatchObject(bounds)
  expect(await convertDate('明萬曆34年（1606年）', answers)).toMatchObject(bounds)
  expect(await convertDate('唐開元十年', reply(url => {
    expect(url.searchParams.get('ival')).toBe('開元10年')
    return url.searchParams.get('ocal') === '1005.1' ? '唐 玄宗 開元10年壬戌 1月1日' : '0722-01-22 // 0723-02-09'
  }))).toMatchObject({ precision: 'year' })
  expect(await convertDate('魏建興2年', reply(url => url.searchParams.get('ocal') === '1005.1' ? '魏 文帝 黃初5年甲辰 1月1日' : '0224-02-07 // 0225-01-27'))).toBeNull()
  expect(await convertDate('明萬曆34年12月（1606）', reply(url => {
    if (url.searchParams.get('ocal') === '1005.1') return '明 神宗 萬曆34年丙午 12月1日'
    return url.searchParams.get('itype') === 'year' ? '1606-02-07 // 1607-01-27' : '1607-01-01 // 1607-01-27'
  }))).toMatchObject({ precision: 'month', end: '1607-01-27' })
  const reading = await convertDate('明萬曆三十四年', answers)
  expect(reading).toMatchObject(bounds)
  expect(new URL(reading!.query!).searchParams.get('ep')).toBe('be')
  expect(await convertDate('清萬曆34年', reply(url => url.searchParams.get('ocal') === '1005.1' ? '明 神宗 萬曆34年丙午 1月1日' : '1606-02-07 // 1607-01-27'))).toBeNull()
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
  expect(westernDate('1986-05-18 - 1989-08-18')).toEqual(westernDate('1986-05-18至1989-08-18'))
  expect(westernDate('1986-05-18至1989-08-18')).toEqual({ start: '1986-05-18', end: '1989-08-18', precision: 'range' })
  expect(westernDate('c. 980')).toMatchObject({ start: '0980-01-01', precision: 'year', approximate: true })
  expect(westernDate('2024/05/01')).toEqual(westernDate('2024-05-01'))
  expect(westernDate('1936年頃')).toMatchObject({ approximate: true, start: '1936-01-01' })
  expect(westernDate('1930年代')).toMatchObject({ start: '1930-01-01', end: '1939-12-31', precision: 'range' })
  expect(westernDate('1500年2月')).toMatchObject({ end: '1500-02-29', precision: 'month' })
  for (const text of ['34年', '12', '1582-10-10', '1900-02-29', 'volume 1932', 'circa', '1939–1932']) expect(westernDate(text)).toBeNull()
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

test('an unavailable calendar cannot disambiguate an unqualified era', async () => {
  const mixed = (async (url: string) => new URL(url).searchParams.get('ical') === '1005.1'
    ? new Response('unavailable', { status: 503 }) : new Response('1791-02-03 // 1792-01-23')) as typeof fetch
  expect(await convertDate('令和2年（2020）', reply(url => {
    expect(url.searchParams.get('ical')).toBe('1001.1')
    return '2020-01-01 // 2020-12-31'
  }))).toMatchObject({ start: '2020-01-01', end: '2020-12-31' })
  expect(await convertDate('寛政3年', mixed)).toBeNull()
  expect(await convertDate('日本寛政3年', mixed)).toMatchObject({ start: '1791-02-03' })
  const missing = (async (url: string) => new URL(url).searchParams.get('ical') === '1005.1'
    ? new Response('runtime error', { status: 500 }) : new Response('1791-02-03 // 1792-01-23')) as typeof fetch
  expect(await convertDate('寛政3年', missing)).toMatchObject({ start: '1791-02-03' })
  expect(await convertDate('建武3年', missing)).toBeNull()
})

test('an edit racing a recovered date retries and keeps one decade, then redaction removes its last cached copy', async () => {
  const { raw, db } = openTestDb()
  const person = await createPerson(db)
  const who = { actor: person.id, ip: null }
  const fields = { script: 'han' as const, script_other: null, radical: null, strokes: null, claims: [], description: null }
  const form = new FormData()
  form.set('place', 'Book')
  form.set('original_date', wanli)
  form.set('report_date', '1935')
  const sighting = readSightingFields(form)
  raw.prepare('INSERT INTO date_readings VALUES (?, ?)').run(wanli, JSON.stringify({ ...bounds, query: 'https://ap.hutime.org/cal/' }))
  const entry = await createEntry(db, fields, sighting, [], who)
  raw.prepare('UPDATE date_readings SET reading = NULL WHERE transcription = ?').run(wanli)
  raw.exec(readFileSync(new URL('../../../scripts/reindex-dates.sql', import.meta.url), 'utf8'))
  expect((await getEntry(db, entry))!.entry.first_year).toBe('1935')

  const recovered = await prepareDates(db, [wanli], reply(url => url.searchParams.get('ocal') === '1005.1' ? '明 神宗 萬曆34年丙午 1月1日' : '1606-02-07 // 1607-01-27'))
  const batch = db.batch.bind(db)
  let concurrent = true
  db.batch = async statements => {
    if (concurrent && statements.some(s => (s as unknown as { sql: string }).sql.startsWith('INSERT INTO revisions'))) {
      concurrent = false
      await batch([...recovered.save, ...recovered.reindex])
    }
    return batch(statements)
  }
  expect(await editEntry(db, entry, 1, fields, who, null)).toMatchObject({ ok: true })
  expect(concurrent).toBe(false)
  expect((await getEntry(db, entry))!.entry.first_year).toBe('1606')
  expect(raw.query("SELECT tag, n FROM tag_counts WHERE tag GLOB 'y:*'").all()).toEqual([{ tag: 'y:1600', n: 1 }])

  const original = raw.query("SELECT id, sighting_id FROM revisions WHERE kind = 'sighting'").get() as { id: number; sighting_id: number }
  await editSighting(db, original.sighting_id, 1, { ...sighting, original_date: null }, null, who, null, entry)
  expect(raw.query('SELECT transcription FROM date_readings WHERE transcription = ?').get(wanli)).toBeTruthy()
  const legacy = raw.prepare("INSERT INTO revisions(entry_id, kind, rev, snapshot, actor, at) VALUES (?, 'sighting_edit', 0, ?, ?, '2026')")
  for (const snapshot of ['malformed', '{"report_date":24,"vias":["loose text",{"report_date":32}]}']) legacy.run(entry, snapshot, who.actor)
  await redactRevision(db, entry, original.id, who, null)
  expect(raw.query('SELECT transcription FROM date_readings WHERE transcription = ?').get(wanli)).toBeNull()
})
