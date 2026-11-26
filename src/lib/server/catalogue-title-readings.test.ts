import { expect, test } from 'bun:test'
import { catalogueTitleReadings } from '../../../scripts/catalogue-title-readings'
import { titleReadingKey } from '../name-key'
import { openTestDb } from './testdb'
import { suggestSources } from './source-aliases'

test('library readings and generated search spellings reach the original title', async () => {
  const titles = ['大南一統志', '和製漢字の辞典', '한국 한자', 'Từ Điển Chữ Nôm', '東京', '北塔', 'Book of 東京']
  const { db, raw } = openTestDb()
  const variants = titles.map(title => (raw.query('SELECT spelling FROM source_title_readings WHERE title = ?')
    .all(title) as { spelling: string }[]).map(r => r.spelling))
  const keys = await catalogueTitleReadings(titles, variants)
  const insert = raw.prepare('INSERT OR IGNORE INTO source_title_readings(title,lookup,spelling,generated) VALUES (?,?,?,1)')
  expect(keys[6].has('bookoftokyo')).toBe(true)
  expect(keys[6].has('bokoftokyo')).toBe(false)
  for (const [i, title] of titles.entries()) {
    raw.run('INSERT INTO sources(hash,title,name_lookup,records) VALUES (?,?,?,1)', [String(i), title, title.toLowerCase()])
    for (const [key, spelling] of keys[i]) insert.run(title, key, spelling)
  }
  for (const [i, queries] of [
    ['Dai Nam nhat thong chi', 'Da Nan Yi Tong Zhi', '大南一统志', '대남일통지', 'Dainan Ittōshi', 'Dainan Ittoushi'],
    ['Wasei Kanji no Jiten', 'わせいかんじのじてん'], ['Hanguk Hanja'], ['Tu Dien Chu Nom'], ['Tōkyō', 'Toukyou'],
  ].entries()) {
    for (const query of queries) {
      expect((await suggestSources(db, query)).map(row => row.title)).toEqual([titles[i]])
    }
  }
  expect((await suggestSources(db, 'Đại Nam nhất thống chí'))[0].reading).toBe('Đại Nam nhất thống chí')
  expect((await suggestSources(db, 'Da Nan Yi Tong Zhi'))[0].reading).toBeNull()
  raw.run("INSERT INTO source_aliases(source_id,lookup,spelling) SELECT id,'bei','Bei' FROM sources WHERE title='北塔'")
  raw.run("INSERT INTO source_aliases(source_id,lookup,spelling) SELECT id,'beita','Beita' FROM sources WHERE title='北塔'")
  expect((await suggestSources(db, 'bei'))[0]).toMatchObject({ title: '北塔', alias: 'Bei' })
  raw.run("UPDATE sources SET records = 0 WHERE title = '大南一統志'")
  expect(await suggestSources(db, 'Dai Nam nhat thong chi')).toEqual([])

  for (const row of raw.query('SELECT lookup, spelling FROM source_title_readings WHERE generated = 0').all() as { lookup: string; spelling: string }[]) {
    expect(titleReadingKey(row.spelling)).toBe(row.lookup)
  }
})
