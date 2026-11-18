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
