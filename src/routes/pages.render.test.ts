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
const ids = resolve('src/lib/ids.ts')
const composer = resolve('src/lib/composer.ts')
const comparisonRows = resolve('src/lib/comparison-rows.ts')
const fileField = resolve('src/lib/components/FileField.svelte')
const cropField = resolve('src/lib/components/CropField.svelte')
const idsGlyph = resolve('src/lib/components/IdsGlyph.svelte')
const idsDrawing = resolve('src/lib/components/IdsDrawing.svelte')
const scriptSelect = resolve('src/lib/components/ScriptSelect.svelte')
const comparisonGrid = resolve('src/lib/components/ComparisonGrid.svelte')
const appForms = resolve(tmp, 'app-forms.js')
writeFileSync(appForms, 'export function enhance() { return {} }\n')
const components = new Map<string, Promise<any>>()
let fileFieldModule: Promise<string> | null = null
let cropFieldModule: Promise<string> | null = null
let idsGlyphModule: Promise<string> | null = null
let idsDrawingModule: Promise<string> | null = null
let scriptSelectModule: Promise<string> | null = null
let comparisonGridModule: Promise<string> | null = null

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

function loadCropField(): Promise<string> {
  if (!cropFieldModule) {
    cropFieldModule = (async () => {
      const preprocessed = await preprocess(readFileSync(cropField, 'utf8'), vitePreprocess({ script: true }), { filename: cropField })
      const { js } = compile(preprocessed.code, { filename: cropField, generate: 'server' })
      const target = resolve(tmp, 'cropfield.js')
      writeFileSync(target, js.code)
      return target
    })()
  }
  return cropFieldModule
}

function loadComparisonGrid(): Promise<string> {
  if (!comparisonGridModule) {
    comparisonGridModule = (async () => {
      const preprocessed = await preprocess(readFileSync(comparisonGrid, 'utf8'), vitePreprocess({ script: true }), { filename: comparisonGrid })
      const { js } = compile(preprocessed.code, { filename: comparisonGrid, generate: 'server' })
      const target = resolve(tmp, 'comparison-grid.js')
      writeFileSync(target, js.code.replaceAll("'$lib/i18n'", `'${i18n}'`).replaceAll('"$lib/i18n"', `"${i18n}"`).replaceAll("'$lib/comparison-rows'", `'${comparisonRows}'`).replaceAll('"$lib/comparison-rows"', `"${comparisonRows}"`))
      return target
    })()
  }
  return comparisonGridModule
}

function loadIdsGlyph(): Promise<string> {
  if (!idsGlyphModule) {
    idsGlyphModule = (async () => {
      const preprocessed = await preprocess(readFileSync(idsGlyph, 'utf8'), vitePreprocess({ script: true }), { filename: idsGlyph })
      const { js } = compile(preprocessed.code, { filename: idsGlyph, generate: 'server' })
      const target = resolve(tmp, 'idsglyph.js')
      writeFileSync(target, js.code)
      return target
    })()
  }
  return idsGlyphModule
}

function loadIdsDrawing(): Promise<string> {
  if (!idsDrawingModule) {
    idsDrawingModule = (async () => {
      const preprocessed = await preprocess(readFileSync(idsDrawing, 'utf8'), vitePreprocess({ script: true }), { filename: idsDrawing })
      const { js } = compile(preprocessed.code, { filename: idsDrawing, generate: 'server' })
      const target = resolve(tmp, 'idsdrawing.js')
      const code = js.code.replaceAll("'$lib/ids'", `'${ids}'`).replaceAll('"$lib/ids"', `"${ids}"`).replaceAll("'$lib/composer'", `'${composer}'`).replaceAll('"$lib/composer"', `"${composer}"`)
      writeFileSync(target, code)
      return target
    })()
  }
  return idsDrawingModule
}

function loadScriptSelect(): Promise<string> {
  if (!scriptSelectModule) {
    scriptSelectModule = (async () => {
      const preprocessed = await preprocess(readFileSync(scriptSelect, 'utf8'), vitePreprocess({ script: true }), { filename: scriptSelect })
      let { js } = compile(preprocessed.code, { filename: scriptSelect, generate: 'server' })
      const code = js.code.replaceAll("'$lib/script'", `'${script}'`).replaceAll('"$lib/script"', `"${script}"`)
      const target = resolve(tmp, 'scriptselect.js')
      writeFileSync(target, code)
      return target
    })()
  }
  return scriptSelectModule
}

async function load(path: string, name: string) {
  let pending = components.get(name)
  if (!pending) {
    pending = (async () => {
      const file = resolve(path)
      const preprocessed = await preprocess(readFileSync(file, 'utf8'), vitePreprocess({ script: true }), { filename: file })
      let { js } = compile(preprocessed.code, { filename: file, generate: 'server' })
      const dep = await loadFileField()
      const crop = await loadCropField()
      const glyph = await loadIdsGlyph()
      const drawing = await loadIdsDrawing()
      const select = await loadScriptSelect()
      const grid = await loadComparisonGrid()
      const code = js.code.replaceAll('"$lib/components/ComparisonGrid.svelte"', `"${grid}"`).replaceAll("'$lib/components/ComparisonGrid.svelte'", `'${grid}'`).replaceAll('"$lib/components/FileField.svelte"', `"${dep}"`).replaceAll("'$lib/components/FileField.svelte'", `'${dep}'`).replaceAll('"$lib/components/CropField.svelte"', `"${crop}"`).replaceAll("'$lib/components/CropField.svelte'", `'${crop}'`).replaceAll('"$lib/components/IdsGlyph.svelte"', `"${glyph}"`).replaceAll("'$lib/components/IdsGlyph.svelte'", `'${glyph}'`).replaceAll('"$lib/components/IdsDrawing.svelte"', `"${drawing}"`).replaceAll("'$lib/components/IdsDrawing.svelte'", `'${drawing}'`).replaceAll('"$lib/components/ScriptSelect.svelte"', `"${select}"`).replaceAll("'$lib/components/ScriptSelect.svelte'", `'${select}'`).replaceAll("'$lib/i18n'", `'${i18n}'`).replaceAll('"$lib/i18n"', `"${i18n}"`).replaceAll("'$lib/script'", `'${script}'`).replaceAll('"$lib/script"', `"${script}"`).replaceAll('"$app/forms"', `"${appForms}"`).replaceAll("'$app/forms'", `'${appForms}'`)
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
    expect(body).toContain('<span class="visually-hidden">⿰木木</span>')
    expect(body).toContain('href="/export.json"')
    expect(body).toContain('JSONで書き出す')
    expect(body).toContain('もっと見る')
  })

  test('home draws a cached description and keeps its IDS for assistive tech', async () => {
    const { body } = await page('src/routes/[locale]/+page.svelte', 'home-glyph', {
      data: { locale: 'en', entries: [{ id: 7, script: 'Han', ids: '⿰木木', place: 'Book' }], glyphs: { '⿰木木': 'M0 0' }, next: null, scripts: [{ script: 'Han', n: 1 }], total: 1, script: null },
    })
    expect(body).toContain('<svg viewBox="0 0 1000 1000"')
    expect(body).toContain('d="M0 0"')
    expect(body).toContain('<span class="visually-hidden">⿰木木</span>')
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

  test('populated home ends the gallery with an add row', async () => {
    const { body } = await page('src/routes/[locale]/+page.svelte', 'home-add-row', {
      data: { locale: 'zh-Hant', entries: [{ id: 7, script: 'Han', ids: '⿰木木', place: '本書' }], next: 42, scripts: [{ script: 'Han', n: 1 }], total: 1, script: null },
    })
    // The add row is the gallery's last child; entry cards hold no divs, so the first closing div ends the grid.
    const start = body.indexOf('class="card-grid gallery"')
    const grid = body.slice(start, body.indexOf('</div>', start))
    expect(start).toBeGreaterThan(-1)
    expect(grid).toContain('href="/zh-Hant/entry/7"')
    expect(grid).toContain('class="add-card"')
    expect(grid).toContain('href="/zh-Hant/new"')
    expect(grid).toContain('新增字')
    expect(grid.indexOf('class="add-card"')).toBeGreaterThan(grid.indexOf('href="/zh-Hant/entry/7"'))
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
    expect(body).toContain('href="/en?script=Tangut&amp;ivd=registered"')
    expect(body).toContain('href="/en?script=Tangut&amp;ivd=none"')
    expect(body).toContain('Not registered')
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
      data: {
        locale: 'zh-Hant',
        genres: [{ slug: 'music', label: '音樂', parent: null }, { slug: 'dialect', label: '方言字', parent: null }],
        collections: [{ slug: 'extension-e', label: 'Extension E' }],
        tags: ['客語'],
      },
      form: { errors: { image: '圖片必須是有效的JPEG、PNG或WebP檔案。' }, values: { script: 'Han' } },
    })
    expect(head).toContain('新增字 · 珍字集覽')
    expect(body).toContain('<h1>新增字</h1>')
    expect(body).toContain('出處圖片')
    expect(body).toContain('或提供連結')
    expect(body).not.toMatch(/id="image"[^>]*required/)
    expect(body).toContain('常見的位置與裝置中繼資料會被移除，JPEG圖片方向保留。')
    expect(body).toContain('JPEG、PNG 或 WebP · 8 MiB')
    expect(body).toContain('瀏覽')
    expect(body).toContain('請只上傳你有權分享的圖片。')
    expect(body).toContain('novalidate')
    expect(body).toContain('aria-describedby="file-formats image-help image-rights image-error"')
    expect(body).toContain('id="file-formats"')
    expect(body).toContain('發現地點或出處')
    expect(body).toContain('證據')
    expect(body).toContain('出處備註')
    expect(body).toContain('義項')
    expect(body).toContain('釋義')
    expect(body).toContain('你的發現')
    expect(body).toContain('請檢查以下各項。')
    expect(body).toContain('圖片必須是有效的JPEG、PNG或WebP檔案。')
    expect(body).toContain('enctype="multipart/form-data"')
    expect(body).toContain('name="image"')
    expect(body).toContain('type="file"')
    expect(body).toContain('accept="image/jpeg,image/png,image/webp"')
    expect(body).toContain('<input type="hidden" name="script" value="Han"/>')
    expect(body).not.toContain('<select id="script"')
    expect(body).toContain('name="ids"')
    expect(body).toContain('class="ids-preview"')
    expect(body).toContain('ids-drawing')
    expect(body).toContain('required="" aria-required="true"')
    expect(body).toContain('class="required-mark" aria-hidden="true">*</span>')
    expect(body).toContain('https://ids.mkpo.li/')
    expect(body).toContain('IDS Workshop')
    expect(body).toContain('name="tags"')
    expect(body).toContain('name="genre" value="music"')
    expect(body).toContain('name="genre" value="dialect"')
    expect(body).toContain('name="collection" value="extension-e"')
    expect(body).toContain('name="url"')
    expect(body).toContain('連結')
    expect(body).toContain('相關文字')
    expect(body).toContain('在方框裡填入異體字和訛體。')
    expect(body).toContain('異體字 1')
    expect(body).toContain('訛體 10')
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

  test('entry page keeps the character text apart from its evidence', async () => {
    const { head, body } = await page('src/routes/[locale]/entry/[id]/+page.svelte', 'entry', {
      data: {
        locale: 'ko',
        entry: { id: 9, script: 'Han', ids: '⿰木木', description: null, radical: null, encoded_as: null, strokes: null, created_at: '2026-11-08T05:00:00.000Z' },
        glyph: 'M0 0',
        comparisons: [{ character: '漢', relationship: 'variant' }],
        evidence: [{ id: 4, place: '서울', url: null, title: null, author: null, publisher: null, year: null, page: null, note: null, source_id: null, has_image: 1, created_at: '2026-11-08T05:00:00.000Z' }],
      },
    })
    expect(head).toContain('문자 9 · 진자집람')
    expect(body).toContain('href="/ko"')
    expect(body).toContain('class="character-card"')
    expect(body).toContain('class="character-glyph"')
    expect(body).toContain('<span class="visually-hidden">⿰木木</span>')
    expect(body).toContain('<svg viewBox="0 0 1000 1000"')
    expect(body).toContain('d="M0 0"')
    expect(body).toContain('class="evidence-section"')
    expect(body).toContain('src="/ko/entry/9/evidence/4/image"')
    expect(body).toContain('alt="서울"')
    expect(body).toContain('표의 문자 구성 설명(IDS)')
    expect(body).toContain('발견한 곳')
    expect(body).toContain('추가일')
    expect(body).toContain('관련 문자')
    expect(body).toContain('이체자')
    expect(body).toContain('href="/ko/entry/9/edit#evidence-4"')
    expect(body).toContain('href="/ko/entry/9/history"')
    expect(body).toContain('기록 편집')
    expect(body).toContain('수정 이력')
    expect(body).not.toContain('src="/ko/entry/9/image"')
    expect(body).not.toContain('https://example.org/source')
  })

  test('entry page shows IVD membership apart from the encoding', async () => {
    const base = { id: 9, script: 'Han', ids: null, description: null, radical: null, encoded_as: 'U+4E00', strokes: null, place: 'Book', title: null, author: null, publisher: null, year: null, page: null, note: null, created_at: '2026-11-08T05:00:00.000Z', has_image: 0 }
    const registered = await page('src/routes/[locale]/entry/[id]/+page.svelte', 'entry-ivd', {
      data: { locale: 'en', entry: { ...base, ivd_status: 'registered', ivd_sequence: 'U+4E00 U+E0100' }, comparisons: [] },
    })
    expect(registered.body).toContain('Encoded as')
    expect(registered.body).toContain('U+4E00')
    expect(registered.body).toContain('>IVD<')
    expect(registered.body).toContain('U+4E00 U+E0100')
    const absent = await page('src/routes/[locale]/entry/[id]/+page.svelte', 'entry-ivd-none', {
      data: { locale: 'ja', entry: { ...base, ivd_status: 'none', ivd_sequence: null }, comparisons: [] },
    })
    expect(absent.body).toContain('未登録')
    expect(absent.body).not.toContain('U+4E00 U+E0100')
  })

  test('entry page keeps evidence below the character card and links a URL source', async () => {
    const { body } = await page('src/routes/[locale]/entry/[id]/+page.svelte', 'entry-evidence', {
      data: {
        locale: 'en',
        entry: { id: 9, script: 'Han', ids: null, description: null, place: 'Seoul', title: null, author: null, publisher: null, year: null, page: null, note: null, created_at: '2026-11-08T05:00:00.000Z', has_image: 0 },
        glyph: null,
        comparisons: [],
        evidence: [{ id: 5, place: 'https://example.org/scan', url: null, title: 'Scan', author: null, publisher: null, year: '2026', page: null, note: null, source_id: 3, has_image: 0, created_at: '2026-11-08T05:00:00.000Z' }],
        crops: [],
      },
    })
    expect(body).toContain('class="character-card"')
    expect(body.indexOf('character-card')).toBeLessThan(body.indexOf('evidence-section'))
    expect(body).toContain('class="evidence-card"')
    expect(body).toContain('href="https://example.org/scan"')
    expect(body).toContain('↗')
    expect(body).toContain('href="/en/source/3"')
    expect(body).toContain('Source details')
  })

  test('entry page falls back to the IDS text when no drawing is cached', async () => {
    const { body } = await page('src/routes/[locale]/entry/[id]/+page.svelte', 'entry-no-glyph', {
      data: {
        locale: 'en',
        entry: { id: 9, script: 'Han', ids: '⿰木木', description: null, place: 'Seoul', title: null, author: null, publisher: null, year: null, page: null, note: null, created_at: '2026-11-08T05:00:00.000Z', has_image: 0 },
        glyph: null,
        comparisons: [],
        evidence: [],
        crops: [],
      },
    })
    expect(body).toContain('<span class="fallback')
    expect(body).not.toContain('<svg viewBox="0 0 1000 1000"')
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

  test('edit page keeps character fields and evidence forms apart', async () => {
    const { head, body } = await page('src/routes/[locale]/entry/[id]/edit/+page.svelte', 'edit', {
      data: {
        locale: 'ja',
        entry: { id: 9, revision: 2, edit_generation: 5, script: 'Han', ids: '⿰木木', description: '説明', radical: null, encoded_as: null, strokes: null, comparisons: [] },
        evidence: [{ id: 4, place: '本書', url: 'https://example.org/scan', title: '題名', author: '著者', publisher: '出版者', year: '1900', page: '8', note: 'メモ', has_image: 1, source_id: null }],
        senses: [{ id: 1, gloss: '意味', reading: 'いみ' }],
        tags: ['客家'],
        genres: [],
        collections: [],
        allGenres: [],
        allCollections: [],
        allTags: ['客家'],
      },
      form: {
        action: 'evidence',
        evidenceId: 4,
        message: '編集中にこの記録が更新されました。現在の版を別のタブで開き、そちらに変更を反映してください。',
        revision: '2',
        generation: '5',
        values: { place: '未保存の場所', url: 'https://example.org/scan', title: '題名', note: 'メモ' },
        errors: { place: '文字を見つけた場所を入力してください（500文字以内）。' },
      },
    })
    expect(head).toContain('記録を編集 · 珍字集覧')
    expect(body).toContain('<h1>記録を編集</h1>')
    expect(body).toContain('name="revision"')
    expect(body).toContain('name="edit_generation"')
    expect(body).toContain('value="未保存の場所"')
    expect(body).toContain('編集中にこの記録が更新されました。')
    expect(body).toContain('aria-invalid="true"')
    expect(body).toContain('証拠を保存')
    expect(body).toContain('href="/ja/entry/9"')
    expect(body).toContain('name="script"')
    expect(body).toContain('<select id="script" name="script"')
    expect(body).toContain('name="url"')
    expect(body).toContain('value="https://example.org/scan"')
    expect(body).toContain('name="description"')
    expect(body).toContain('name="sense_gloss"')
    expect(body).toContain('name="evidence"')
    expect(body).toContain('証拠を追加')
    expect(body).toContain('src="/ja/entry/9/evidence/4/image"')
  })

  test('edit page selects a script outside the list and normalises the stored value', async () => {
    const entry = { id: 9, revision: 2, edit_generation: 5, script: '  Old script  ', ids: null, description: null, place: '書', title: null, author: null, publisher: null, year: null, page: null, note: null }
    const { body } = await page('src/routes/[locale]/entry/[id]/edit/+page.svelte', 'edit-script-fallback', {
      data: { locale: 'en', entry },
    })
    expect(body).toContain('<option value="Old script" selected="">Old script</option>')

    const decomposed = await page('src/routes/[locale]/entry/[id]/edit/+page.svelte', 'edit-script-nfd', {
      data: { locale: 'en', entry: { ...entry, script: 'Chữ Nôm'.normalize('NFD') } },
    })
    expect(decomposed.body).toContain('<option value="Chữ Nôm" selected="">Chữ Nôm</option>')
  })

  test('batch form starts each row with Han', async () => {
    const { body } = await page('src/routes/[locale]/batch/+page.svelte', 'batch', { data: { locale: 'ja' } })
    expect(body).toContain('<select id="script-0" name="script"')
    expect(body).toMatch(/<option value="Han" selected="">Han<\/option>/)
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

  test('genre browse page renders the taxonomy chips and matching entries', async () => {
    const { head, body } = await page('src/routes/[locale]/genre/[slug]/+page.svelte', 'genre', {
      data: {
        locale: 'zh-Hant',
        genre: { slug: 'wu', label: '吳語' },
        genres: [{ slug: 'music', label: '樂譜' }, { slug: 'medicine', label: '醫藥' }, { slug: 'wu', label: '吳語' }],
        entries: [{ id: 5, script: 'Han', ids: '⿰口儂', description: '吳語代詞' }],
      },
    })
    expect(head).toContain('吳語 · 珍字集覽')
    expect(body).toContain('<h1>吳語</h1>')
    expect(body).toContain('href="/zh-Hant/genre/medicine"')
    expect(body).toContain('醫藥')
    expect(body).toContain('aria-current="page" href="/zh-Hant/genre/wu"')
    expect(body).toContain('href="/zh-Hant/entry/5"')
    expect(body).toContain('⿰口儂')
  })

  test('entry page renders provider attribution with a link on evidence', async () => {
    const { body } = await page('src/routes/[locale]/entry/[id]/+page.svelte', 'entry-provider', {
      data: {
        locale: 'ja',
        entry: { id: 12, script: 'Han', ids: '⿰魚羊', description: null, radical: null, encoded_as: null, strokes: null, ivd_status: null, ivd_sequence: null, place: '', title: null, author: null, publisher: null, year: null, page: null, note: null, created_at: '2026-11-08T05:00:00.000Z', has_image: 0 },
        glyph: null,
        comparisons: [],
        evidence: [
          { id: 1, place: '', url: null, provider: '難読漢字図書館', provider_url: 'https://example.org/nandoku', title: null, author: null, publisher: null, year: null, page: null, note: null, source_id: 1, has_image: 0, created_at: '2026-11-08T05:00:00.000Z' },
        ],
      },
    })
    expect(body).toContain('提供者')
    expect(body).toContain('href="https://example.org/nandoku"')
    expect(body).toContain('難読漢字図書館 ↗')
  })
})
