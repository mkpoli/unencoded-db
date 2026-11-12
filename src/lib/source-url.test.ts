import { expect, test } from 'bun:test'
import { postInfo, workMention } from './source-url'

test('a work is read from book-title brackets or from a line of title and volume', () => {
  expect(workMention(['『和名類聚抄』巻二十に見える字'])).toEqual({ title: '和名類聚抄', page: '巻二十' })
  expect(workMention(['出自《康熙字典》'])).toEqual({ title: '康熙字典', page: null })
  expect(workMention(['和名類聚抄 20巻'])).toEqual({ title: '和名類聚抄', page: '20巻' })
  expect(workMention(['説文解字巻13'])).toEqual({ title: '説文解字', page: '巻13' })
  expect(workMention(['玉篇　卷三'])).toEqual({ title: '玉篇', page: '卷三' })
  expect(workMention(['面白い字\n和名類聚抄 20巻'])).toEqual({ title: '和名類聚抄', page: '20巻' })
})

test('running text and a bare number name no work', () => {
  expect(workMention(['どんな「器」見せてんだよ笑\nちなみにU外字です'])).toBeNull()
  expect(workMention(['全20巻読んだ'])).toBeNull()
  expect(workMention(['20巻'])).toBeNull()
  expect(workMention(['これは3巻に出てくる字です'])).toBeNull()
  expect(workMention([])).toBeNull()
})

test('the post is read before its replies, and brackets before a bare line', () => {
  expect(workMention(['玉篇 巻3', '『説文解字』'])).toEqual({ title: '説文解字', page: null })
  expect(workMention(['玉篇 巻3', '広韻 巻1'])).toEqual({ title: '玉篇', page: '巻3' })
})

const author = { screen_name: 'someone' }
const status = { id: '2119717540968738934', text: 'どんな「器」見せてんだよ笑\nちなみにU外字です', author, created_timestamp: 1794215018 }

test('a post whose author names the book in a reply gives the book', () => {
  const info = postInfo({ status, thread: [status, { id: '2119717622229110988', text: '和名類聚抄 20巻', author }] })
  expect(info).toEqual({
    place: 'X', author: '@someone', title: 'どんな「器」見せてんだよ笑 ちなみにU外字です',
    url: 'https://x.com/someone/status/2119717540968738934', date: '2026-11-09', work: { title: '和名類聚抄', page: '20巻' },
  })
})

test('a reply by someone else is not read', () => {
  const info = postInfo({ status, thread: [status, { id: '3', text: '康熙字典 巻3', author: { screen_name: 'other' } }] })
  expect(info?.work).toBeNull()
})

test('a response without a post gives nothing', () => {
  expect(postInfo({ code: 404 })).toBeNull()
  expect(postInfo(null)).toBeNull()
})
