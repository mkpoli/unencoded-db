import { japaneseOnlyEras } from './japanese-eras'
import { MAX_READING_LENGTH, westernDate, type DateReading } from '../dates'

// Input dynasty preferences from https://ap.hutime.org/cal/chineseCalendar.html .
const dynasties: Record<string, number> = {
  殷: 131, 西周: 141, 東周: 151, 秦: 201, 西漢: 221, 新: 231, 東漢: 271, 魏: 311, 蜀漢: 321,
  吳: 331, 西晋: 351, 東晋: 361, 北魏: 411, 前宋: 421, 齊: 431, 梁: 441, 東魏: 451, 西魏: 456,
  北齊: 461, 北周: 466, 陳: 481, 隋: 511, 唐: 521, 遼: 611, 後梁: 621, 後唐: 631, 後晋: 641,
  後漢: 651, 後周: 661, 北宋: 711, 南宋: 721, 金: 731, 元: 751, 北元: 761, 明: 811, 南明: 821, 清: 841,
}

const numeral = '[0-9〇零一二三四五六七八九十廿卅]+'
const eraDate = new RegExp(`^(\\p{Script=Han}{2,12}?)(元|${numeral})年(?:([閏闰]?(?:正|${numeral}))月(?:初?(${numeral})日)?)?$`, 'u')
const digits: Record<string, string> = { 元: '1', 正: '1', 〇: '0', 零: '0', 一: '1', 二: '2', 三: '3', 四: '4', 五: '5', 六: '6', 七: '7', 八: '8', 九: '9' }
function decimal(text: string) {
  const value = text.replace('廿', '二十').replace('卅', '三十').replace(/[元正〇零一二三四五六七八九]/g, char => digits[char])
  const tens = /^(\d?)十(\d?)$/.exec(value)
  return tens ? Number(tens[1] || 1) * 10 + Number(tens[2]) : /^\d{1,4}$/.test(value) ? Number(value) : NaN
}

export async function convertDate(raw: string, request: typeof fetch = fetch, deadline?: AbortSignal): Promise<DateReading | null> {
  if (raw.length > MAX_READING_LENGTH) return null
  const western = westernDate(raw)
  if (western) return western
  const value = raw.normalize('NFKC').trim().replace(/\s+/g, '')
    .replace(/^(\d{3,4})年?\(([^()]+年)\)$/, '$2($1)')
  // A parenthetical Western year identifies the era year without changing its bounds.
  const annotation = /\((\d{3,4})年?\)$/.exec(value)
  const match = eraDate.exec(annotation ? value.slice(0, annotation.index) : value)
  if (!match) return null
  const [, name, y, m, d] = match
  const year = decimal(y), month = m && decimal(m.replace(/^[閏闰]/, '')), day = d && decimal(d)
  if (!year || (m && (!month || Number(month) > 12)) || (d && (!day || Number(day) > 31))) return null
  // Require room for an era name after a dynasty (明治 and 元禄 are themselves eras).
  const dynastyName = name.replace('晉', '晋')
  const dynasty = Object.keys(dynasties).find(prefix => dynastyName.startsWith(prefix) && name.length >= prefix.length + 2)
  const era = dynasty ? name.slice(dynasty.length) : name.replace(/^(?:和暦|日本)/, '')
  const input = `${era}${year}年${m ? (/^[閏闰]/.test(m) ? '閏' : '') + month + '月' : ''}${d ? day + '日' : ''}`
  const kind = d ? 'date' : m ? 'month' : 'year'
  const querySignal = () => {
    const timeout = AbortSignal.timeout(3500)
    return deadline ? AbortSignal.any([deadline, timeout]) : timeout
  }
  async function ask(calendar: string, wholeYear = false): Promise<(DateReading & { query: string }) | 'ambiguous' | null> {
    const precision = wholeYear ? 'year' : kind
    const params = new URLSearchParams({ method: 'conv', ical: calendar, itype: precision, ival: wholeYear ? era + year + '年' : input, ocal: '101.1', otype: 'date', oform: 'yyyy-MM-dd', out: 'text' })
    if (dynasty) params.set('iparam', String(dynasties[dynasty]))
    if (precision !== 'date') params.set('ep', 'be')
    const query = 'https://ap.hutime.org/cal/?' + params
    const response = await request(query, { signal: querySignal() })
    // An unavailable calendar cannot rule out a second interpretation of the same era.
    // HuTime returns 500 for Japanese names absent from its Chinese calendar. An
    // independent era-name catalogue can confirm that absence for these spellings.
    if (response.status === 500 && calendar === '1005.1' && !dynasty && japaneseOnlyEras.has(era)) return null
    if (!response.ok) throw new Error(`HuTime returned ${response.status}`)
    const body = (await response.text()).trim()
    if (!body) return null
    const dates = body.split(/\s*\/\/\s*|\r?\n/).map(s => s.trim())
    if (!dates.every(date => /^\d{4}-\d{2}-\d{2}$/.test(date) && westernDate(date))) throw new Error('Invalid HuTime response')
    const expected = precision === 'date' ? 1 : 2
    if (dates.length > expected) return 'ambiguous'
    if (dates.length !== expected) throw new Error('Incomplete HuTime response')
    if (dates[0] > dates[dates.length - 1]) throw new Error('Reversed HuTime bounds')
    if (annotation && Number(annotation[1]) !== Number(dates[0].slice(0, 4))) {
      // A late lunar month can fall in January of the following Western year.
      if (precision === 'year') return null
      const annotatedYear = await ask(calendar, true)
      if (!annotatedYear || annotatedYear === 'ambiguous' || dates[0] < annotatedYear.start || dates.at(-1)! > annotatedYear.end) return null
    }
    return { start: dates[0], end: dates[dates.length - 1], precision: precision === 'date' ? 'day' : precision, query } satisfies DateReading
  }
  try {
    if (dynasty) {
      const result = await ask('1005.1')
      if (!result || result === 'ambiguous') return null
      // iparam expresses a preference. HuTime may still answer from another dynasty.
      const check = new URL(result.query)
      check.searchParams.set('ocal', '1005.1')
      check.searchParams.set('oparam', String(dynasties[dynasty]))
      check.searchParams.set('ep', 'b')
      check.searchParams.delete('oform')
      // Compare the era as well: on the same day another dynasty can use a different
      // era. HuTime offers three spellings for names written in different scripts.
      for (const lang of ['zh-tw', 'zh-cn', 'ja']) {
        check.searchParams.set('olang', lang)
        const response = await request(check.href, { signal: querySignal() })
        if (!response.ok) return null
        const words = (await response.text()).trim().split(/\s+/)
        if (lang === 'zh-tw' && words[0]?.replace('晉', '晋') !== dynasty) return null
        if (words.some(word => word.startsWith(era + year + '年'))) return result
      }
      return null
    }
    // HuTime's listed Chinese dynasties end with the Qing in 1912. A later stated
    // Western year rules them out and is still checked against the Japanese conversion.
    if (era !== name || (annotation && Number(annotation[1]) > 1912)) {
      const result = await ask('1001.1')
      return result === 'ambiguous' ? null : result
    }
    const [cn, jp] = await Promise.all([ask('1005.1'), ask('1001.1')])
    if (cn === 'ambiguous' || jp === 'ambiguous') return null
    return cn && jp && (cn.start !== jp.start || cn.end !== jp.end) ? null : cn ?? jp
  } catch {
    // The transcription remains usable during a service outage. A sweep can retry it later.
    return null
  }
}
