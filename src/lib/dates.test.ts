import { expect, test } from 'bun:test'
import { bceOf, compareDays, decadeNumber, decadeOf, decadeRuns, isDecade, namesEra, westernDate, yearOfDay } from './dates'

test('a year before the common era is read in each way it is written, and 168 BCE is year -167', () => {
  const year = { start: '-0167-01-01', end: '-0167-12-31', precision: 'year' as const }
  for (const text of ['-168', '−168', '－168', '-168年', '前168年', '前168', '公元前168年', '西元前168年', '紀元前168年', '纪元前168年', '西暦前168年', '168 BCE', '168 BC', '168bc', '168 B.C.', '168 B.C.E.', 'BC 168', 'BCE168', '168 TCN', '기원전 168년', '기원전168'])
    expect([text, westernDate(text)]).toEqual([text, year])
  expect(westernDate('約前168年')).toEqual({ ...year, approximate: true })
  expect(westernDate('c. 168 BCE')).toEqual({ ...year, approximate: true })
  expect(westernDate('前1年')).toMatchObject({ start: '0000-01-01', end: '0000-12-31' })
  expect(westernDate('前16年')).toMatchObject({ start: '-0015-01-01' })
  expect(westernDate('前168年2月')).toEqual({ start: '-0167-02-01', end: '-0167-02-28', precision: 'month' })
  // 1 BCE is year 0, a leap year of the Julian calendar, as 5 BCE is.
  expect(westernDate('前1年2月')).toMatchObject({ end: '0000-02-29' })
  expect(westernDate('前5年2月29日')).toMatchObject({ start: '-0004-02-29', precision: 'day' })
  expect(westernDate('前4年2月29日')).toBeNull()
})

test('a signed year numbered as ISO 8601 pads it, a year 0 and a bare short number stay unread', () => {
  for (const text of ['-0168', '-0167', '0', '-0', '前0年', '0 BCE', '16', '9年', '-168-02-03', '-12345', '前十六年', 'volume 168 BCE', '168 BCE?!', '前漢168年']) expect([text, westernDate(text)]).toEqual([text, null])
})

test('a range before the common era runs forward, and the era after its last year covers both', () => {
  const range = { start: '-0205-01-01', end: '-0167-12-31', precision: 'range' as const }
  for (const text of ['前206–前168年', '前206年～前168年', '前206-前168', '206–168 BCE', '206-168 BC', '206 BCE – 168 BCE', 'BC 206 - BC 168', '-206–-168', '206 to 168 BCE']) expect([text, westernDate(text)]).toEqual([text, range])
  expect(westernDate('前206–220年')).toEqual(westernDate('206 BCE – 220'))
  expect(westernDate('206 BCE – 220')).toMatchObject({ start: '-0205-01-01', end: '0220-12-31' })
  expect(westernDate('30-10 BCE')).toMatchObject({ start: '-0029-01-01', end: '-0009-12-31', precision: 'range' })
  expect(westernDate('前160年代')).toEqual({ start: '-0168-01-01', end: '-0159-12-31', precision: 'range' })
  expect(westernDate('160s BCE')).toEqual(westernDate('前160年代'))
  // Reversed, or with a last year that either era could hold.
  for (const text of ['前168–前206年', '168–206 BCE', '前206–168年', '206 BCE – 168', '-206–168']) expect([text, westernDate(text)]).toEqual([text, null])
})

test('the wording that leaves the era unsaid is told from the wording that names it', () => {
  for (const text of ['前168年', '約前168年', '168 BCE', '168 b.c.', 'BC 168', '168 TCN', '기원전 168년', '160s BCE', '前160年代', '206–168 BCE']) expect([text, namesEra(text)]).toEqual([text, true])
  for (const text of ['-168', '1921', '-206–-168', '明萬曆34年']) expect([text, namesEra(text)]).toEqual([text, false])
})

test('days compare by year before text on both sides of the era', () => {
  const days = ['-1045-01-01', '-0205-12-31', '-0167-01-01', '-0167-12-31', '0000-01-01', '0001-01-01', '0980-05-05', '2024-01-01']
  expect([...days].reverse().sort(compareDays)).toEqual(days)
  expect(days.map(yearOfDay)).toEqual([-1045, -205, -167, -167, 0, 1, 980, 2024])
  expect([1, 0, -167].map(bceOf)).toEqual([null, 1, 168])
})

test('every year falls in one decade, named as decades before the common era are', () => {
  expect([-167, -168, -159, -158, -8, 0, 1, 9, 10, 1921].map(decadeOf)).toEqual([-168, -168, -168, -158, -8, -8, 0, 0, 10, 1920])
  expect([-168, -158, -8, 0, 1920].map(decadeNumber)).toEqual([160, 150, 0, 0, 1920])
  for (let year = -9998, last = decadeOf(-9999); year <= 9999; year++) {
    const decade = decadeOf(year)
    expect(isDecade(String(decade))).toBe(true)
    expect(decade === last || decade > last).toBe(true)
    expect(decade <= year && year - decade < 10).toBe(true)
    last = decade
  }
  for (const text of ['-168x', '-160', '-0', '08', '8', '-08', '-18.0', '', '1935']) expect([text, isDecade(text)]).toEqual([text, false])
})

test('decades run on from one another until a gap is wide', () => {
  expect(decadeRuns([], 4)).toEqual([])
  expect(decadeRuns([-18, 10], 4)).toEqual([[-18, -8, 0, 10]])
  expect(decadeRuns([-168, 1340, 1360], 40)).toEqual([[-168], [1340, 1350, 1360]])
  expect(decadeRuns([1340, 1390], 4)).toEqual([[1340, 1350, 1360, 1370, 1380, 1390]])
  expect(decadeRuns([1340, 1400], 4)).toEqual([[1340], [1400]])
})
