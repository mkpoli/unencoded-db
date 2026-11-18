// The outlines the composer carries beside the export, as URLs this build emits. The export has no
// Bopomofo, Tangut, seal, New Korean, Shuishu, Jurchen or palette glyphs, so a drawing of one asks for
// the file here rather than a path inside the package.
import mincho from 'ids-input/data/ucv-outlines.json.gz?url'
import gothic from 'ids-input/data/ucv-outlines-sans.json.gz?url'
import tangut from 'han-compose/data/sources/tangut/outlines.json.gz?url'
import bopomofo from 'han-compose/data/sources/bopomofo/outlines.json.gz?url'
import newKorean from 'han-compose/data/sources/new-korean/outlines.json.gz?url'
import smallSeal from 'han-compose/data/sources/small-seal/outlines.json.gz?url'
import shuishu from 'han-compose/data/sources/shuishu/outlines.json.gz?url'
import jurchen from 'han-compose/data/sources/jurchen/outlines.json.gz?url'
import palette from 'han-compose/data/sources/palette/outlines.json.gz?url'
import numbered from 'han-compose/data/numbered-sans-outlines.json.gz?url'
import numberedContext from 'han-compose/data/numbered-five-context.json?url'
import customForms from 'han-compose/data/custom-forms.json.gz?url'

// The Unicode shards draw a part the export has no glyph for, one file per 256 code points. Vite
// lists them as this build's files. A run outside Vite (the tests) lists none, and the composer reads
// the package's own copies, which only a host with a file system can.
const shards: Record<string, string> = import.meta.env?.SSR === undefined ? {}
  : import.meta.glob('/node_modules/han-compose/data/unicode/outlines/*.json.gz', { query: '?url', import: 'default', eager: true })

export const composerData: Record<string, string> = {
  ...Object.fromEntries(Object.entries(shards).map(([file, url]) => [file.slice(file.indexOf('/data/') + '/data/'.length), url])),
  'sources/tangut/outlines.json.gz': tangut,
  'sources/bopomofo/outlines.json.gz': bopomofo,
  'sources/new-korean/outlines.json.gz': newKorean,
  'sources/small-seal/outlines.json.gz': smallSeal,
  'sources/shuishu/outlines.json.gz': shuishu,
  'sources/jurchen/outlines.json.gz': jurchen,
  'sources/palette/outlines.json.gz': palette,
  'numbered-sans-outlines.json.gz': numbered,
  'numbered-five-context.json': numberedContext,
  'custom-forms.json.gz': customForms,
}

export const composerDataFor = (style: string) => ({ ...composerData, 'host/outlines.json.gz': style === 'sans' ? gothic : mincho })
