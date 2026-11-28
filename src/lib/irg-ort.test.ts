import { expect, test } from 'bun:test'
import { mapOrtSourceToSighting, parseCitationText, parseOrtPage } from './irg-ort'

const enc = (obj: unknown) => JSON.stringify(obj).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

test('parseCitationText extracts CJK book titles, years and locators', () => {
  expect(parseCitationText('《古壮字字典》 page 038 col 1 entry 6')).toEqual({
    title: '《古壮字字典》',
    reportDate: null,
    page: 'page 038 col 1 entry 6',
  })
  expect(parseCitationText('《19世纪香港新界的客家方言》(2014)')).toEqual({
    title: '《19世纪香港新界的客家方言》',
    reportDate: '2014',
    page: null,
  })
  expect(parseCitationText('{29} Hanyu Fangyan Da Cidian p. 108')).toEqual({
    title: 'Hanyu Fangyan Da Cidian',
    reportDate: null,
    page: 'p. 108',
  })
  expect(parseCitationText('Tianwenge Qinpu (天闻阁琴谱) vol1, fol2')).toEqual({
    title: 'Tianwenge Qinpu (天闻阁琴谱)',
    reportDate: null,
    page: 'vol1, fol2',
  })
})

test('parseOrtPage and mapOrtSourceToSighting handle WS2021 GZ and UTC JSON payloads', () => {
  const payload = {
    'GZ-0381601': {
      evidence: [{ source_reference: 'GZ-0381601', region: 'G', evidence_no: '0', path: '/gz-evidence/GZ-0381601.jpg', description: null }],
      info: {
        source_reference: 'GZ-0381601',
        region: 'GZ',
        data: {
          group: 'China (GZ - 《古壮字字典》)',
          'k) Ref. to Evidence doc': '《古壮字字典》 page 038 col 1 entry 6',
        },
      },
    },
  }
  const html = `<!doctype html><title>00010 | ⿰右百 | WS2021v7.0</title><ws-evidences data-evidence="${enc(payload)}"></ws-evidences>`
  const parsed = parseOrtPage(html, 'ws2021', 'https://hc.jsecs.org/irg/ws2021/app/index.php?find=GZ-0381601')!
  expect(parsed.serial).toBe('00010')
  expect(parsed.sources).toHaveLength(1)
  expect(parsed.sources[0]).toMatchObject({
    sourceRef: 'GZ-0381601',
    title: '《古壮字字典》',
    page: 'page 038 col 1 entry 6',
    directUrl: null,
    evidenceUrls: ['https://hc.jsecs.org/irg/ws2021/data/gz-evidence/GZ-0381601.jpg'],
  })

  const sighting = mapOrtSourceToSighting(parsed, parsed.sources[0])
  expect(sighting.title).toBe('《古壮字字典》')
  expect(sighting.page).toBe('page 038 col 1 entry 6')
  expect(sighting.url).toBeNull()
  expect(sighting.vias).toEqual([{
    url: 'https://hc.jsecs.org/irg/ws2021/app/index.php?id=00010',
    title: 'IRG WS2021-00010 (GZ-0381601)',
    author: null,
    publisher: 'IRG Online Review Tool',
    report_date: null,
    container: 'IRG Working Set 2021',
    source_kind: null,
    quote: null,
  }])
  expect(sighting.note).toContain('IRG source: GZ-0381601')
  expect(sighting.note).toContain('ORT evidence: https://hc.jsecs.org/irg/ws2021/data/gz-evidence/GZ-0381601.jpg')
})

test('parseOrtPage extracts WS2024 multi-evidence descriptions, direct URLs and discussion records', () => {
  const payload = {
    'SAT-05947': {
      evidence: [
        { source_reference: 'SAT-05947', region: 'SAT', evidence_no: '0', path: '/sat-evidence/SAT-05947-01.jpg', description: '大正新脩大藏經, vol. 54, p. 0710' },
        { source_reference: 'SAT-05947', region: 'SAT', evidence_no: '1', path: '/sat-evidence/SAT-05947-02.jpg', description: '一切経音義高麗版（国立国会図書館蔵）, vol. 1240704, p. 0384\nhttps://www2.dhii.jp/ongi/1240704/1240704_0384.jpg' },
      ],
      info: { source_reference: 'SAT-05947', region: 'SAT', data: { 'Character Reference': 'SAT-05947' } },
    },
  }
  const html = `<!doctype html><title>00001 | ㇀ | WS2024v5.0</title><ws-evidences data-evidence="${enc(payload)}"></ws-evidences><table class=dicussion_record data-id="00001"><tr><td><b>IRG #65</b><br>2025-10-14</td><td>no change.</td></tr><tr><td><b>IRG #63</b><br>2024-10-22</td><td>no unification.</td></tr></table>`
  const parsed = parseOrtPage(html, 'ws2024', 'https://hc.jsecs.org/irg/ws2024/app/index.php?id=00001')!
  expect(parsed.discussions).toEqual([
    { meeting: 'IRG #65', text: 'no change.' },
    { meeting: 'IRG #63', text: 'no unification.' },
  ])
  const sighting = mapOrtSourceToSighting(parsed, parsed.sources[0])
  expect(sighting.title).toBe('大正新脩大藏經')
  expect(sighting.page).toBe('vol. 54, p. 0710')
  expect(sighting.url).toBe('https://www2.dhii.jp/ongi/1240704/1240704_0384.jpg')
  expect(sighting.note).toContain('IRG discussion: IRG #65: no change. | IRG #63: no unification.')
  expect(sighting.note).toContain('Additional evidence: 一切経音義高麗版（国立国会図書館蔵）, vol. 1240704, p. 0384')
})

test('parseOrtPage handles WS2017 UK/V payloads and WS2015 HTML tables', () => {
  const ws2017Payload = {
    'UK-10703': {
      source_identifier: 'UK-10703',
      region: 'UK',
      data: { 'UK Ref. to Evidence doc': '064', 'UK Title and Year': '《19世纪香港新界的客家方言》(2014)', 'UK Page No.': 'page 54' },
    },
  }
  const ws2017Html = `<title>UK-10703 | WS2017v6.1</title><ws-evidences data-evidence="${enc(ws2017Payload)}"></ws-evidences><tr><td>0 - Seq. No.</td><td>00002</td></tr>`
  const r2017 = parseOrtPage(ws2017Html, 'ws2017', 'https://hc.jsecs.org/irg/ws2017/app/index.php?find=UK-10703')!
  expect(r2017.serial).toBe('00002')
  expect(r2017.sources[0]).toMatchObject({
    sourceRef: 'UK-10703',
    title: '《19世纪香港新界的客家方言》',
    reportDate: '2014',
    page: 'page 54',
  })

  const ws2015Html = `<title>00001 | ⿱一𠄌 | WS2015v5.0</title><div class=ws2015_evidence><img src="https://raw.githubusercontent.com/hfhchan/irg-ws2015/5d22fba4/data/uk-evidence/IRGN2107_evidence-1513.png"></div><table><tr><td>0 - Sequence Number</td><td>00001</td></tr><tr><td>4 - UK Source</td><td>UK-02764</td></tr><tr><td>44 - UK Ref. to Evidence doc</td><td>{29} Hanyu Fangyan Da Cidian p. 108</td></tr></table>`
  const r2015 = parseOrtPage(ws2015Html, 'ws2015', 'https://hc.jsecs.org/irg/ws2015/app/index.php?id=00001')!
  expect(r2015.serial).toBe('00001')
  expect(r2015.sources[0]).toMatchObject({
    sourceRef: 'UK-02764',
    title: 'Hanyu Fangyan Da Cidian',
    page: 'p. 108',
    evidenceUrls: ['https://raw.githubusercontent.com/hfhchan/irg-ws2015/5d22fba4/data/uk-evidence/IRGN2107_evidence-1513.png'],
  })

  expect(parseOrtPage('<html><body>missing</body></html>', 'ws2024', 'https://hc.jsecs.org/irg/ws2024/app/index.php?id=99999')).toBeNull()
})
