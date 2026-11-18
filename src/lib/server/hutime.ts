import { westernDate, type DateReading } from '../dates'

// Input dynasty preferences from https://ap.hutime.org/cal/chineseCalendar.html .
const dynasties: Record<string, number> = {
  殷: 131, 西周: 141, 東周: 151, 秦: 201, 西漢: 221, 新: 231, 東漢: 271, 魏: 311, 蜀漢: 321,
  吳: 331, 西晋: 351, 東晋: 361, 北魏: 411, 前宋: 421, 齊: 431, 梁: 441, 東魏: 451, 西魏: 456,
  北齊: 461, 北周: 466, 陳: 481, 隋: 511, 唐: 521, 遼: 611, 後梁: 621, 後唐: 631, 後晋: 641,
  後漢: 651, 後周: 661, 北宋: 711, 南宋: 721, 金: 731, 元: 751, 北元: 761, 明: 811, 南明: 821, 清: 841,
}

const numeral = '[0-9元〇零一二三四五六七八九十廿卅]+'
const eraDate = new RegExp(`^(\\p{Script=Han}{2,12}?)(${numeral})年(?:([閏闰]?(?:正|${numeral}))月(?:初?(${numeral})日)?)?$`, 'u')
const digits: Record<string, string> = { 元: '1', 正: '1', 〇: '0', 零: '0', 一: '1', 二: '2', 三: '3', 四: '4', 五: '5', 六: '6', 七: '7', 八: '8', 九: '9' }
function decimal(text: string) {
  const value = text.replace('廿', '二十').replace('卅', '三十').replace(/[元正〇零一二三四五六七八九]/g, char => digits[char])
  const tens = /^(\d?)十(\d?)$/.exec(value)
  return tens ? Number(tens[1] || 1) * 10 + Number(tens[2]) : /^\d{1,4}$/.test(value) ? Number(value) : NaN
}

export async function convertDate(raw: string, request: typeof fetch = fetch): Promise<DateReading | null> {
  const western = westernDate(raw)
  if (western) return western
  const value = raw.normalize('NFKC').trim().replace(/\s+/g, '')
  const match = eraDate.exec(value)
  if (!match) return null
  const [, name, y, m, d] = match
  const year = decimal(y), month = m && decimal(m.replace(/^[閏闰]/, '')), day = d && decimal(d)
  if (!year || (m && (!month || Number(month) > 12)) || (d && (!day || Number(day) > 31))) return null
  // Require room for an era name after a dynasty (明治 and 元禄 are themselves eras).
  const dynasty = Object.keys(dynasties).find(prefix => name.startsWith(prefix) && name.length >= prefix.length + 2)
  const era = name.replace(/^(?:和暦|日本)/, '')
  const input = `${era}${year}年${m ? (/^[閏闰]/.test(m) ? '閏' : '') + month + '月' : ''}${d ? day + '日' : ''}`
  const kind = d ? 'date' : m ? 'month' : 'year'
  async function ask(calendar: string) {
    const params = new URLSearchParams({ method: 'conv', ical: calendar, itype: kind, ival: input, ocal: '101.1', otype: 'date', oform: 'yyyy-MM-dd', out: 'text' })
    if (dynasty) params.set('iparam', String(dynasties[dynasty]))
    if (!d) params.set('ep', 'be')
    const query = 'https://ap.hutime.org/cal/?' + params
    const response = await request(query, { signal: AbortSignal.timeout(3500) })
    // HuTime also returns HTTP 500 for era names absent from the trial Chinese calendar.
    if (!response.ok) return null
    const body = (await response.text()).trim()
    const dates = body.split(/\s*\/\/\s*|\r?\n/).map(s => s.trim())
    if (!dates.every(date => /^\d{4}-\d{2}-\d{2}$/.test(date) && westernDate(date))) return null
    if (dates.length > (d ? 1 : 2)) return 'ambiguous'
    if (dates.length !== (d ? 1 : 2)) return null
    if (dates[0] > dates[dates.length - 1]) return null
    return { start: dates[0], end: dates[dates.length - 1], precision: d ? 'day' : m ? 'month' : 'year', query } satisfies DateReading
  }
  try {
    if (dynasty) {
      const result = await ask('1005.1')
      if (!result || result === 'ambiguous') return null
      // iparam expresses a preference. HuTime may still answer from another dynasty.
      const check = new URL(result.query)
      check.searchParams.set('ocal', '1005.1')
      check.searchParams.set('oparam', String(dynasties[dynasty]))
      check.searchParams.set('olang', 'zh-tw')
      check.searchParams.set('ep', 'b')
      check.searchParams.delete('oform')
      const response = await request(check.href, { signal: AbortSignal.timeout(3500) })
      return response.ok && (await response.text()).trim().split(/\s+/)[0] === dynasty ? result : null
    }
    if (era !== name) {
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
