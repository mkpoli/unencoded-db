import { describe, expect, test } from 'bun:test'
import { compile, preprocess } from 'svelte/compiler'
import { render } from 'svelte/server'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const tmp = resolve('.svelte-kit/render-tmp')
mkdirSync(tmp, { recursive: true })
const i18n = resolve('src/lib/i18n.ts')
const fileField = resolve('src/lib/components/FileField.svelte')
const components = new Map<string, Promise<any>>()
let fileFieldModule: Promise<string> | null = null

function loadFileField(): Promise<string> {
  if (!fileFieldModule) {
    fileFieldModule = (async () => {
      const preprocessed = await preprocess(readFileSync(fileField, 'utf8'), vitePreprocess({ script: true }), { filename: fileField })
      const { js } = compile(preprocessed.code, { filename: fileField, generate: 'server' })
      const target = resolve(tmp, 'filefield.js')
      writeFileSync(target, js.code)
      return target
    })()
  }
  return fileFieldModule
}

async function load(path: string, name: string) {
  let pending = components.get(name)
  if (!pending) {
    pending = (async () => {
      const file = resolve(path)
      const preprocessed = await preprocess(readFileSync(file, 'utf8'), vitePreprocess({ script: true }), { filename: file })
      let { js } = compile(preprocessed.code, { filename: file, generate: 'server' })
      const dep = await loadFileField()
      const code = js.code.replaceAll("'$lib/i18n'", `'${i18n}'`).replaceAll('"$lib/i18n"', `"${i18n}"`).replaceAll('"$lib/components/FileField.svelte"', `"${dep}"`).replaceAll("'$lib/components/FileField.svelte'", `'${dep}'`)
      const target = resolve(tmp, `${name}.js`)
      writeFileSync(target, code)
      return (await import(`${target}?${Date.now()}`)).default
    })()
    components.set(name, pending)
  }
  return pending
}

const page = (path: string, name: string, props: Record<string, unknown>) => load(path, name).then(component => render(component, { props }))

describe('localized pages', () => {
  test('home renders the Japanese title, tagline and locale-prefixed links', async () => {
    const { head, body } = await page('src/routes/[locale]/+page.svelte', 'home', {
      data: { locale: 'ja', entries: [{ id: 7, script: 'Han', ids: '⿰木木', place: '本書' }], next: 42 },
    })
    expect(head).toContain('珍字集覧')
    expect(body).toContain('文字と字形の証拠を集めるコミュニティウィキ')
    expect(body).toContain('href="/ja/entry/7"')
    expect(body).toContain('href="/ja?before=42"')
    expect(body).toContain('もっと見る')
  })

  test('empty home renders the localized empty state and add link', async () => {
    const { head, body } = await page('src/routes/[locale]/+page.svelte', 'home', {
      data: { locale: 'en', entries: [], next: null },
    })
    expect(head).toContain('Rare Character Compendium')
    expect(body).toContain('A community evidence wiki for characters and glyphs')
    expect(body).toContain('Nothing has been recorded yet.')
    expect(body).toContain('href="/en/new"')
    expect(body).toContain('Add a character')
  })

  test('every locale has its approved name and corrected tagline', async () => {
    const expected: Record<string, [string, string]> = {
      en: ['Rare Character Compendium', 'A community evidence wiki for characters and glyphs'],
      ja: ['珍字集覧', '文字と字形の証拠を集めるコミュニティウィキ'],
      'zh-Hans': ['珍字集览', '收集文字与字形证据的社区维基'],
      'zh-Hant': ['珍字集覽', '收集文字與字形證據的社群維基'],
      ko: ['진자집람', '문자와 글리프의 증거를 모으는 커뮤니티 위키'],
      vi: ['Tuyển tập chữ quý', 'Wiki cộng đồng thu thập bằng chứng về chữ và glyph'],
    }
    for (const [locale, [name, tagline]] of Object.entries(expected)) {
      const { head, body } = await page('src/routes/[locale]/+page.svelte', 'home', { data: { locale, entries: [], next: null } })
      expect(head, locale).toContain(name)
      expect(body, locale).toContain(tagline)
    }
  })

  test('new record form renders the localized source image fields and errors', async () => {
    const { head, body } = await page('src/routes/[locale]/new/+page.svelte', 'new', {
      data: { locale: 'zh-Hant' },
      form: { errors: { image: '圖片必須是有效的JPEG、PNG或WebP檔案。' }, values: { script: 'Han' } },
    })
    expect(head).toContain('新增字 · 珍字集覽')
    expect(body).toContain('<h1>新增字</h1>')
    expect(body).toContain('出處圖片')
    expect(body).toContain('常見的位置與裝置中繼資料會被移除，JPEG圖片方向保留。')
    expect(body).toContain('JPEG、PNG 或 WebP · 8 MiB')
    expect(body).toContain('瀏覽')
    expect(body).toContain('請只上傳你有權分享的圖片。')
    expect(body).toContain('novalidate')
    expect(body).toContain('aria-describedby="file-formats image-help image-rights image-error"')
    expect(body).toContain('id="file-formats"')
    expect(body).toContain('發現地點或出處')
    expect(body).toContain('出處詳情')
    expect(body).toContain('書目資訊')
    expect(body).toContain('選填')
    expect(body).toContain('請檢查以下各項。')
    expect(body).toContain('圖片必須是有效的JPEG、PNG或WebP檔案。')
    expect(body).toContain('enctype="multipart/form-data"')
    expect(body).toContain('name="image"')
    expect(body).toContain('type="file"')
    expect(body).toContain('accept="image/jpeg,image/png,image/webp"')
    expect(body).not.toContain('name="url"')
    expect(body).not.toContain('HTTP或HTTPS網址')
    expect(body).toContain('相關文字')
    expect(body).toContain('最多可比較10個字。')
    expect(body).toContain('新增比較')
    expect(body).toContain('>儲存 <span aria-hidden="true">→</span></button>')
    expect(body).toContain('class="file-field invalid"')
    expect(body).toContain('選擇圖片')
  })

  test('entry page renders the Korean image, labels and alt fallback', async () => {
    const { head, body } = await page('src/routes/[locale]/entry/[id]/+page.svelte', 'entry', {
      data: {
        locale: 'ko',
        entry: { id: 9, script: 'Han', ids: '⿰木木', description: null, place: '서울', title: null, author: null, publisher: null, year: null, page: null, note: null, created_at: '2026-11-08T05:00:00.000Z', has_image: 1 },
        comparisons: [{ character: '漢', relationship: 'variant', differences: '획 하나 차이', evidence: '4쪽' }],
      },
    })
    expect(head).toContain('기록 9 · 진자집람')
    expect(body).toContain('href="/ko"')
    expect(body).toContain('src="/ko/entry/9/image"')
    expect(body).toContain('alt="출처 이미지"')
    expect(body).toContain('표의 문자 구성 설명(IDS)')
    expect(body).toContain('발견한 곳')
    expect(body).toContain('추가일')
    expect(body).toContain('관련 문자')
    expect(body).toContain('이체자')
    expect(body).toContain('획 하나 차이')
    expect(body).toContain('4쪽')
    expect(body).toContain('href="/ko/entry/9/edit"')
    expect(body).toContain('href="/ko/entry/9/history"')
    expect(body).toContain('기록 수정')
    expect(body).toContain('수정 이력')
    expect(body).not.toContain('https://example.org/source')
  })

  test('edit page renders localized evidence fields, tokens and a stale-form notice', async () => {
    const { head, body } = await page('src/routes/[locale]/entry/[id]/edit/+page.svelte', 'edit', {
      data: { locale: 'ja', entry: { id: 9, revision: 2, edit_generation: 5, script: 'Han', ids: '⿰木木', description: '説明', place: '本書', title: '題名', author: '著者', publisher: '出版者', year: '1900', page: '8', note: 'メモ' } },
      form: {
        message: '編集中にこの記録が更新されました。現在の版を別のタブで開き、そちらに変更を反映してください。',
        revision: '2',
        generation: '5',
        values: { place: '未保存の場所', script: 'Han' },
        errors: { place: '文字を見つけた場所を入力してください（500文字以内）。' },
      },
    })
    expect(head).toContain('記録を修正 · 珍字集覧')
    expect(body).toContain('<h1>記録を修正</h1>')
    expect(body).toContain('name="revision"')
    expect(body).toContain('name="edit_generation"')
    expect(body).toContain('value="未保存の場所"')
    expect(body).toContain('編集中にこの記録が更新されました。')
    expect(body).toContain('id="place-error"')
    expect(body).toContain('aria-invalid="true"')
    expect(body).toContain('修正を保存')
    expect(body).toContain('href="/ja/entry/9"')
    expect(body).toContain('name="script"')
    expect(body).toContain('name="description"')
  })

  test('history page renders revisions, dates and the older link', async () => {
    const { head, body } = await page('src/routes/[locale]/entry/[id]/history/+page.svelte', 'history', {
      data: {
        locale: 'zh-Hans',
        id: 9,
        next: 2,
        revisions: [
          { entry_id: 9, revision: 3, tombstone: false, script: 'Han', ids: null, description: null, place: '书', title: '题名', author: null, publisher: null, year: null, page: null, note: null, recorded_at: '2026-11-08T05:00:00.000Z' },
        ],
      },
    })
    expect(head).toContain('修订历史 · 珍字集览')
    expect(body).toContain('<h1>修订历史</h1>')
    expect(body).toContain('第3版')
    expect(body).toContain('记录时间')
    expect(body).toContain('href="/zh-Hans/entry/9"')
    expect(body).toContain('2026')
    expect(body).toContain('href="?before=2"')
    expect(body).toContain('更早的版本')
  })

  test('history page shows a localized marker instead of redacted content', async () => {
    const { body } = await page('src/routes/[locale]/entry/[id]/history/+page.svelte', 'history-redacted', {
      data: {
        locale: 'ja',
        id: 9,
        next: null,
        revisions: [
          { entry_id: 9, revision: 4, recorded_at: '2026-11-08T05:00:00.000Z', tombstone: true },
          { entry_id: 9, revision: 3, tombstone: false, script: 'Han', ids: null, description: null, place: '本書', title: null, author: null, publisher: null, year: null, page: null, note: null, recorded_at: '2026-11-08T04:00:00.000Z' },
        ],
      },
    })
    expect(body).toContain('第4版')
    expect(body).toContain('この版の内容は削除されました。')
    expect(body).toContain('第3版')
    expect(body).toContain('本書')
  })

  test('error page renders the localized not-found message and home link', async () => {
    const notFound = await page('src/lib/components/ErrorPage.svelte', 'error', { locale: 'zh-Hans', status: 404 })
    expect(notFound.head).toContain('此页面不存在。 · 珍字集览')
    expect(notFound.body).toContain('<h1>此页面不存在。</h1>')
    expect(notFound.body).toContain('404')
    expect(notFound.body).toContain('此页面不存在。')
    expect(notFound.body).toContain('href="/zh-Hans"')
    expect(notFound.body).toContain('返回记录列表')

    const failed = await page('src/lib/components/ErrorPage.svelte', 'error', { locale: 'zh-Hans', status: 500 })
    expect(failed.body).toContain('出了点问题')
  })

  test('language switcher links to the same path and query in all six locales', async () => {
    const { body } = await page('src/lib/components/LanguageSwitcher.svelte', 'switcher', { locale: 'ja', pathname: '/ja/entry/7', search: '?before=2' })
    for (const [tag, href] of [['en', '/en/entry/7?before=2'], ['ja', '/ja/entry/7?before=2'], ['zh-Hans', '/zh-Hans/entry/7?before=2'], ['zh-Hant', '/zh-Hant/entry/7?before=2'], ['ko', '/ko/entry/7?before=2'], ['vi', '/vi/entry/7?before=2']]) {
      expect(body).toContain(`href="${href}"`)
      expect(body).toContain(`hreflang="${tag}"`)
    }
    expect(body).toContain('日本語')
    expect(body).toContain('简体中文')
    expect(body).toContain('繁體中文')
    expect(body).toContain('한국어')
    expect(body).toContain('Tiếng Việt')
    expect(body.match(/aria-current="page"/g)).toHaveLength(1)
  })
})
