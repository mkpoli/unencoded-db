import { describe, expect, test } from 'bun:test'
import { compile, preprocess } from 'svelte/compiler'
import { render } from 'svelte/server'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const tmp = resolve('.svelte-kit/render-tmp')
mkdirSync(tmp, { recursive: true })
const i18n = resolve('src/lib/i18n.ts')
const script = resolve('src/lib/script.ts')
const fileField = resolve('src/lib/components/FileField.svelte')
const appForms = resolve(tmp, 'app-forms.js')
writeFileSync(appForms, 'export function enhance() { return {} }\n')
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
      const code = js.code.replaceAll("'$lib/i18n'", `'${i18n}'`).replaceAll('"$lib/i18n"', `"${i18n}"`).replaceAll("'$lib/script'", `'${script}'`).replaceAll('"$lib/script"', `"${script}"`).replaceAll('"$lib/components/FileField.svelte"', `"${dep}"`).replaceAll("'$lib/components/FileField.svelte'", `'${dep}'`).replaceAll('"$app/forms"', `"${appForms}"`).replaceAll("'$app/forms'", `'${appForms}'`)
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
      data: { locale: 'ja', entries: [{ id: 7, script: 'Han', ids: '⿰木木', place: '本書' }], next: 42, scripts: [{ script: 'Han', n: 1 }], total: 1, script: null },
    })
    expect(head).toContain('珍字集覧')
    expect(body).toContain('文字と字形の証拠を集めるコミュニティウィキ')
    expect(body).toContain('href="/ja/entry/7"')
    expect(body).toContain('href="/ja?before=42"')
    expect(body).toContain('href="/export.json"')
    expect(body).toContain('JSONで書き出す')
    expect(body).toContain('もっと見る')
  })

  test('empty home renders the localized empty state and add link', async () => {
    const { head, body } = await page('src/routes/[locale]/+page.svelte', 'home', {
      data: { locale: 'en', entries: [], next: null, scripts: [], total: 0, script: null },
    })
    expect(head).toContain('Rare Character Compendium')
    expect(body).toContain('A community evidence wiki for characters and glyphs')
    expect(body).toContain('Nothing has been recorded yet.')
    expect(body).toContain('href="/en/new"')
    expect(body).toContain('Add a character')
  })

  test('home marks the chosen script and labels each card with its script', async () => {
    const { body } = await page('src/routes/[locale]/+page.svelte', 'home-scripts', {
      data: {
        locale: 'en',
        entries: [
          { id: 3, script: 'Tangut', ids: '⿰𘠀𘠁', place: 'Book' },
          { id: 2, script: 'Han', ids: '⿰木木', place: 'Book' },
        ],
        next: 1,
        scripts: [{ script: 'Han', n: 1 }, { script: 'Tangut', n: 1 }],
        total: 2,
        script: 'Tangut',
      },
    })
    expect(body).toMatch(/<a class="script-tab" aria-current="page" href="\/en\?script=Tangut"/)
    expect(body).toMatch(/<span class="script-count">2<\/span>/)
    expect(body).toMatch(/<span class="script-tag han" title="Han">Han<\/span>/)
    expect(body).toMatch(/<span class="script-tag" title="Tangut">Tangut<\/span>/)
    expect(body).toContain('href="/en?script=Tangut&amp;before=1"')
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
    expect(body).toContain('照片、掃描檔或截圖。連結或出處已足夠時可留空。')
    expect(body).toContain('JPEG、PNG 或 WebP · 8 MiB')
    expect(body).toContain('瀏覽')
    expect(body).toContain('請只上傳你有權分享的圖片。')
    expect(body).toContain('novalidate')
    expect(body).toContain('aria-describedby="file-formats image-help image-rights image-error"')
    expect(body).toContain('id="file-formats"')
    expect(body).toContain('發現地點或出處')
    expect(body).toContain('出處詳情')
    expect(body).toContain('更多資訊')
    expect(body).toContain('選填')
    expect(body).toContain('請檢查以下各項。')
    expect(body).toContain('圖片必須是有效的JPEG、PNG或WebP檔案。')
    expect(body).toContain('enctype="multipart/form-data"')
    expect(body).toContain('name="image"')
    expect(body).toContain('type="file"')
    expect(body).toContain('accept="image/jpeg,image/png,image/webp"')
    expect(body).toContain('name="url"')
    expect(body).toContain('連結')
    expect(body).toContain('頁面、貼文或目錄條目；請輸入完整的http(s)位址。')
    expect(body).toContain('相關文字')
    expect(body).toContain('最多可比較10個字。')
    expect(body).toContain('新增比較')
    expect(body).toContain('>儲存 <span aria-hidden="true">→</span></button>')
    expect(body).toContain('class="file-field invalid"')
    expect(body).toContain('選擇圖片')
  })

  test('IDS input offers related records', async () => {
    const { body } = await page('src/routes/[locale]/new/+page.svelte', 'new-suggestions', {
      data: { locale: 'ja', suggestions: [{ ids: '⿰木木', script: 'Han' }] },
      form: { values: { ids: '⿰木木', script: 'Han' } },
    })
    expect(body).toContain('関連する記録')
    expect(body).toContain('記録を選ぶと文字体系とIDSが入ります。')
    expect(body).toContain('⿰木木')
    expect(body).toContain('suggestion-list')
  })

  test('entry page renders the Korean image, labels and alt fallback', async () => {
    const { head, body } = await page('src/routes/[locale]/entry/[id]/+page.svelte', 'entry', {
      data: {
        locale: 'ko',
        entry: { id: 9, script: 'Han', ids: '⿰木木', description: null, place: '서울', title: null, author: null, publisher: null, year: null, page: null, note: null, created_at: '2026-11-08T05:00:00.000Z', has_image: 1 },
        comparisons: [{ character: '漢', relationship: 'variant', differences: '획 하나 차이', evidence: '4쪽' }],
      },
    })
    expect(head).toContain('문자 9 · 진자집람')
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

  test('entry page shows moderator controls only when a moderator is present', async () => {
    const data = {
      locale: 'ko',
      entry: { id: 9, script: 'Han', ids: null, description: null, place: '서울', title: null, author: null, publisher: null, year: null, page: null, note: null, created_at: '2026-11-08T05:00:00.000Z', has_image: 0 },
      comparisons: [],
    }
    const anonymous = await page('src/routes/[locale]/entry/[id]/+page.svelte', 'entry-public', { data })
    expect(anonymous.body).not.toContain('moderation-bar')
    const moderator = await page('src/routes/[locale]/entry/[id]/+page.svelte', 'entry-moderator', { data: { ...data, isModerator: true } })
    expect(moderator.body).toContain('moderation-bar')
    expect(moderator.body).toContain('관리자 보기')
    expect(moderator.body).toContain('action="/ko/moderate/9/hide"')
  })

  test('queue page renders hidden records with the design-system cards', async () => {
    const { head, body } = await page('src/routes/[locale]/moderate/+page.svelte', 'queue', {
      data: {
        locale: 'ja',
        moderator: 'mod@example.com',
        next: 3,
        entries: [{ id: 7, script: 'Han', description: '説明', place: '本書', created_at: '2026-11-08T05:00:00.000Z' }],
      },
    })
    expect(head).toContain('非表示の記録')
    expect(body).toContain('class="card-grid"')
    expect(body).toContain('class="entry-card queue-card"')
    expect(body).toContain('class="entry-actions"')
    expect(body).toContain('action="/ja/moderate/7/restore"')
    expect(body).toContain('再表示')
    expect(body).toContain('href="/ja/moderate?before=3"')
    expect(body).toContain('mod@example.com')
  })

  test('empty queue renders the localized empty state', async () => {
    const { body } = await page('src/routes/[locale]/moderate/+page.svelte', 'queue-empty', {
      data: { locale: 'vi', moderator: 'mod@example.com', next: null, entries: [] },
    })
    expect(body).toContain('empty-state')
    expect(body).toContain('Không có mục từ nào bị ẩn.')
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

  test('conflict page returns to the localized moderation queue', async () => {
    const { body } = await page('src/lib/components/ErrorPage.svelte', 'error-conflict', { locale: 'ja', status: 409 })
    expect(body).toContain('この操作の前に記録が変更されました。')
    expect(body).toContain('href="/ja/moderate"')
    expect(body).toContain('非表示の記録に戻る')
  })

  test('entry page offers the localized anonymous report form', async () => {
    const { body } = await page('src/routes/[locale]/entry/[id]/+page.svelte', 'entry-report-form', {
      data: {
        locale: 'zh-Hant',
        reported: false,
        isModerator: false,
        entry: { id: 9, script: 'Han', ids: null, description: null, place: '臺北', title: null, author: null, publisher: null, year: null, page: null, note: null, created_at: '2026-11-08T05:00:00.000Z', has_image: 0 },
        comparisons: [],
      },
    })
    expect(body).toContain('action="/zh-Hant/entry/9/report"')
    expect(body).toContain('檢舉此記錄')
    expect(body).toContain('垃圾訊息')
    expect(body).toContain('送出檢舉')
    expect(body).toContain('name="reason"')
    expect(body).toContain('name="note"')
  })

  test('entry page confirms a received report', async () => {
    const { body } = await page('src/routes/[locale]/entry/[id]/+page.svelte', 'entry-reported', {
      data: {
        locale: 'ja',
        reported: true,
        isModerator: false,
        entry: { id: 9, script: 'Han', ids: null, description: null, place: '東京', title: null, author: null, publisher: null, year: null, page: null, note: null, created_at: '2026-11-08T05:00:00.000Z', has_image: 0 },
        comparisons: [],
      },
    })
    expect(body).toContain('通報を受け付けました。モデレーターが確認します。')
    expect(body).toContain('class="notice" role="status"')
  })

  test('reports queue renders open reports with the design-system cards', async () => {
    const { head, body } = await page('src/routes/[locale]/moderate/reports/+page.svelte', 'reports', {
      data: {
        locale: 'ja',
        moderator: 'mod@example.com',
        next: 3,
        reports: [{ report_id: 12, reason: 'privacy', note: '個人情報です', created_at: '2026-11-08T05:00:00.000Z', entry_id: 7, script: 'Han', description: '説明', place: '本書' }],
      },
    })
    expect(head).toContain('未対応の通報 · 珍字集覧')
    expect(body).toContain('class="card-grid"')
    expect(body).toContain('class="entry-card queue-card"')
    expect(body).toContain('class="entry-actions"')
    expect(body).toContain('action="/ja/moderate/reports/12/dismiss"')
    expect(body).toContain('却下')
    expect(body).toContain('action="/ja/moderate/7/hide"')
    expect(body).toContain('href="/ja/entry/7"')
    expect(body).toContain('プライバシー')
    expect(body).toContain('個人情報です')
    expect(body).toContain('href="/ja/moderate/reports?before=3"')
  })

  test('empty reports queue renders the localized empty state', async () => {
    const { body } = await page('src/routes/[locale]/moderate/reports/+page.svelte', 'reports-empty', {
      data: { locale: 'vi', moderator: 'mod@example.com', next: null, reports: [] },
    })
    expect(body).toContain('empty-state')
    expect(body).toContain('Không có báo cáo chưa xử lý.')
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
