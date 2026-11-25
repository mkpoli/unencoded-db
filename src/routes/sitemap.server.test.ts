import { expect, test } from 'bun:test'
import { LOCALES } from '$lib/i18n'
import { SITE_ORIGIN } from '$lib/seo'
import { ENTRIES_PER_SITEMAP } from '$lib/server/sitemap'
import { openTestDb } from '$lib/server/testdb'
import { GET as index } from './sitemap.xml/+server'
import { GET as child } from './sitemap-[part].xml/+server'

test('entry sitemaps list all locales for live records and skip shards with only hidden or merged records', async () => {
  const { db, raw } = openTestDb()
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026')")
  const insert = raw.prepare(`INSERT INTO entries(id, script, created_by, created_at, updated_at, hidden_at, merged_into)
    VALUES (?, 'han', 'p', '2026', '2026', ?, ?)`)
  const firstOfSecond = ENTRIES_PER_SITEMAP + 1
  insert.run(1, null, null)
  insert.run(2, 'hidden', null)
  insert.run(firstOfSecond, null, null)
  insert.run(firstOfSecond + 1, null, 1)
  insert.run(2 * ENTRIES_PER_SITEMAP + 1, 'hidden', null)

  const platform = { env: { DB: db } }
  const sitemapIndex = await index({ platform } as Parameters<typeof index>[0])
  expect(sitemapIndex.headers.get('content-type')).toStartWith('application/xml')
  const locations = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1])
  expect(locations(await sitemapIndex.text())).toEqual(['site', '1', '2'].map(part => `${SITE_ORIGIN}/sitemap-${part}.xml`))

  const shard = (part: string) => child({ platform, params: { part } } as Parameters<typeof child>[0])
  for (const [part, id] of [['1', 1], ['2', firstOfSecond]] as const) {
    expect(locations(await (await shard(part)).text())).toEqual(LOCALES.map(locale => `${SITE_ORIGIN}/${locale}/entry/${id}`))
  }
  await expect(shard('3')).rejects.toMatchObject({ status: 404 })
})

test('source sitemaps list sources that visible records cite', async () => {
  const { db, raw } = openTestDb()
  raw.exec(`INSERT INTO sources(id, hash, title, records) VALUES (1, 'a', 'Cited', 2), (2, 'b', 'Uncited', 0), (${ENTRIES_PER_SITEMAP + 3}, 'c', 'Later', 1)`)
  const platform = { env: { DB: db } }
  const locations = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1])
  const sitemapIndex = await index({ platform } as Parameters<typeof index>[0])
  expect(locations(await sitemapIndex.text())).toEqual(['site', 'sources-1', 'sources-2'].map(part => `${SITE_ORIGIN}/sitemap-${part}.xml`))
  const shard = (part: string) => child({ platform, params: { part } } as Parameters<typeof child>[0])
  expect(locations(await (await shard('sources-1')).text())).toEqual(LOCALES.map(locale => `${SITE_ORIGIN}/${locale}/source/1`))
  await expect(shard('sources-3')).rejects.toMatchObject({ status: 404 })
  await expect(shard('sources-0')).rejects.toMatchObject({ status: 404 })
})

test('record sitemaps say when each record last changed', async () => {
  const { db, raw } = openTestDb()
  raw.exec(`INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026');
    INSERT INTO entries(id, script, created_by, created_at, updated_at) VALUES
      (1, 'han', 'p', '2026', '2026-11-16T14:13:22.122Z'), (2, 'han', 'p', '2026', 'not a time')`)
  const xml = await (await child({ platform: { env: { DB: db } }, params: { part: '1' } } as Parameters<typeof child>[0])).text()
  expect(xml).toContain(`<url><loc>${SITE_ORIGIN}/en/entry/1</loc><lastmod>2026-11-16T14:13:22.122Z</lastmod><xhtml:link`)
  expect(xml).toContain(`<url><loc>${SITE_ORIGIN}/en/entry/2</loc><xhtml:link`)
})

test('record sitemaps list the pictures of visible sightings, through the export index', async () => {
  const { db, raw } = openTestDb()
  raw.exec(`INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026');
    INSERT INTO entries(id, script, created_by, created_at, updated_at) VALUES (1, 'han', 'p', '2026', '2026');
    INSERT INTO sightings(id, entry_id, first_entry, place, created_by, created_at, updated_at, hidden_at) VALUES
      (1, 1, 1, 'Book', 'p', '2026', '2026', null), (2, 1, 1, 'Hidden', 'p', '2026', '2026', 'hidden');
    INSERT INTO sighting_media(sighting_id, position, image_key, image_type, image_w, image_h, thumb_key) VALUES
      (1, 0, 'page.png', 'image/png', 1, 1, 'page-t.png'), (1, 1, 'detail.png', 'image/png', 1, 1, 'detail-t.png'),
      (2, 0, 'hidden.png', 'image/png', 1, 1, 'hidden-t.png');`)
  const plans: string[] = []
  const traced = { prepare(sql: string) {
    const stmt = db.prepare(sql)
    return { bind(...values: unknown[]) {
      plans.push(...(raw.query(`EXPLAIN QUERY PLAN ${sql}`).all(...values as never[]) as { detail: string }[]).map(row => row.detail))
      return stmt.bind(...values)
    } }
  } } as D1Database
  const xml = await (await child({ platform: { env: { DB: traced } }, params: { part: '1' } } as Parameters<typeof child>[0])).text()
  expect(xml).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"')
  const images = [...xml.matchAll(/<image:loc>([^<]+)<\/image:loc>/g)].map(match => match[1])
  expect(images.slice(0, 2)).toEqual([`${SITE_ORIGIN}/media/v2/page.png`, `${SITE_ORIGIN}/media/v2/detail.png`])
  expect(images).not.toContain(`${SITE_ORIGIN}/media/v2/hidden.png`)
  expect(plans.join('\n')).toContain('sightings_visible_export')
  expect(plans.join('\n')).not.toMatch(/USE TEMP B-TREE FOR ORDER BY|SCAN (?:s|x|entries|sightings|sighting_media)(?:\s|$)/)
})

test('page sitemaps name every language and the English default for each page', async () => {
  const { db, raw } = openTestDb()
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026'); INSERT INTO entries(id, script, created_by, created_at, updated_at) VALUES (1, 'han', 'p', '2026', '2026')")
  const entry = await (await child({ platform: { env: { DB: db } }, params: { part: '1' } } as Parameters<typeof child>[0])).text()
  const ja = entry.split('<url>').find(block => block.includes(`<loc>${SITE_ORIGIN}/ja/entry/1</loc>`))!
  expect([...ja.matchAll(/<xhtml:link rel="alternate" hreflang="([^"]+)" href="([^"]+)"\/>/g)].map(match => [match[1], match[2]])).toEqual([
    ...LOCALES.map(locale => [locale, `${SITE_ORIGIN}/${locale}/entry/1`]), ['x-default', `${SITE_ORIGIN}/en/entry/1`],
  ])
  expect(entry).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"')
  const site = await (await child({ platform: { env: { DB: db } }, params: { part: 'site' } } as Parameters<typeof child>[0])).text()
  expect(site).toContain(`hreflang="x-default" href="${SITE_ORIGIN}/"`)
})
