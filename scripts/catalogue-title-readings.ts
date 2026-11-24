import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import kuromoji from 'kuromoji'
import { toRomaji } from 'wanakana'
import { convertHangulToMC2000 } from 'koconv'
import { parseUnihan, unihanBlock, type UnihanRow } from '../src/lib/character-tables'
import { nameLabel, titleReadingKey } from '../src/lib/name-key'

const HAN = /\p{Script=Han}/u
const blocks = new Map<string, Map<string, UnihanRow>>()

function unihan(char: string) {
  const block = unihanBlock(char)
  let rows = blocks.get(block)
  if (!rows) {
    try {
      rows = parseUnihan(readFileSync(join(import.meta.dir, '../static/unihan', block + '.tsv'), 'utf8'))
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause
      rows = new Map()
    }
    blocks.set(block, rows)
  }
  return rows.get(char)
}

// ICU transforms each title on its own line. nameLabel folds embedded line breaks first.
function transform(text: string[], rule: string) {
  const result = Bun.spawnSync(['uconv', '-f', 'utf-8', '-t', 'utf-8', '-x', rule], {
    stdin: new TextEncoder().encode(text.join('\n')),
  })
  if (result.exitCode !== 0) throw new Error(`ICU ${rule}: ${result.stderr}`)
  const lines = result.stdout.toString().split('\n')
  if (lines.length !== text.length) throw new Error(`ICU ${rule} changed the title count`)
  return lines
}

let tokenizer: Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>> | undefined
function japaneseTokenizer() {
  tokenizer ??= new Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>>((resolve, reject) => {
    const dicPath = join(dirname(require.resolve('kuromoji/package.json')), 'dict')
    kuromoji.builder({ dicPath }).build((error, result) => error ? reject(error) : resolve(result))
  })
  return tokenizer
}

// Convert kana runs separately so a Latin word like “book” keeps both vowels.
function hepburn(text: string) {
  return text.replace(/[\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}]+/gu, kana =>
    toRomaji(kana).replace(/ou|oo/g, 'ō').replace(/uu/g, 'ū').replace(/aa/g, 'ā').replace(/ee/g, 'ē'))
}

export async function catalogueTitleReadings(titles: string[], variants: string[][] = []) {
  if (!titles.length) return []
  const originals = titles.map(nameLabel)
  const simplified = transform(originals, 'Traditional-Simplified')
  const traditional = transform(originals, 'Simplified-Traditional')
  const pinyin = transform(originals, 'Han-Latin')
  const latin = transform(originals.map(text => toRomaji(text)), 'Any-Latin; Latin-ASCII')
  const numbered = transform(pinyin, 'Latin-NumericPinyin')
  const dictionary = await japaneseTokenizer()
  const japanese = originals.map(text => dictionary.tokenize(text).map(token => token.reading || token.surface_form).join(''))
  const japaneseLatin = japanese.map(text => toRomaji(text))
  const korean = traditional.map(text => [...text].map(char => HAN.test(char) ? unihan(char)?.ko.split(' ')[0] || char : char).join(''))
  const koreanLatin = korean.map(text => convertHangulToMC2000(text))
  const vietnamese = traditional.map(text => [...text].map(char => {
    const syllable = HAN.test(char) && unihan(char)?.vi.split(' ')[0]
    return syllable ? ` ${syllable} ` : char
  }).join('').trim().replace(/\s+/gu, ' '))
  const vietnameseLatin = transform(vietnamese, 'Latin-ASCII')
  // A library's kana or Hangul reading can differ from what a tokenizer guesses.
  const alternates = variants.flatMap((forms, index) => forms.map(form => ({ index, text: nameLabel(form) })))
  const romanized = alternates.length ? transform(alternates.map(form => toRomaji(form.text)), 'Any-Latin; Latin-ASCII') : []
  const results = originals.map((title, i) => {
    const spellings = [title, simplified[i], traditional[i], latin[i], japanese[i], japaneseLatin[i], hepburn(japanese[i]), korean[i], koreanLatin[i], vietnamese[i], vietnameseLatin[i]]
    if (HAN.test(title)) spellings.push(pinyin[i], numbered[i])
    const names = new Map<string, string>()
    for (const spelling of spellings) {
      const key = titleReadingKey(spelling)
      if (key && !names.has(key)) names.set(key, spelling)
    }
    return names
  })
  for (const [i, { index, text }] of alternates.entries()) {
    const spellings = [romanized[i], convertHangulToMC2000(text)]
    if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) {
      const romaji = toRomaji(text)
      spellings.push(romaji, hepburn(text))
    }
    for (const spelling of spellings) {
      const key = titleReadingKey(spelling)
      if (key && !results[index].has(key)) results[index].set(key, spelling)
    }
  }
  return results
}
