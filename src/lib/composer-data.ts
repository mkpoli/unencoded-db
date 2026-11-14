// The outlines the composer carries beside the export, as URLs this build emits. The export has no
// Bopomofo, Tangut, seal, New Korean, Shuishu, Jurchen or palette glyphs, so a drawing of one asks for
// the file here rather than a path inside the package.
import tangut from '@han-compose/composer/data/sources/tangut/outlines.json.gz?url'
import bopomofo from '@han-compose/composer/data/sources/bopomofo/outlines.json.gz?url'
import newKorean from '@han-compose/composer/data/sources/new-korean/outlines.json.gz?url'
import smallSeal from '@han-compose/composer/data/sources/small-seal/outlines.json.gz?url'
import shuishu from '@han-compose/composer/data/sources/shuishu/outlines.json.gz?url'
import jurchen from '@han-compose/composer/data/sources/jurchen/outlines.json.gz?url'
import palette from '@han-compose/composer/data/sources/palette/outlines.json.gz?url'
import numbered from '@han-compose/composer/data/numbered-sans-outlines.json.gz?url'
import numberedContext from '@han-compose/composer/data/numbered-five-context.json?url'

export const composerData: Record<string, string> = {
  'sources/tangut/outlines.json.gz': tangut,
  'sources/bopomofo/outlines.json.gz': bopomofo,
  'sources/new-korean/outlines.json.gz': newKorean,
  'sources/small-seal/outlines.json.gz': smallSeal,
  'sources/shuishu/outlines.json.gz': shuishu,
  'sources/jurchen/outlines.json.gz': jurchen,
  'sources/palette/outlines.json.gz': palette,
  'numbered-sans-outlines.json.gz': numbered,
  'numbered-five-context.json': numberedContext,
}
