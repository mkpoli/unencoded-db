import { describe, expect, test } from 'bun:test'
import { cleanSourceUrl, firstPhoto, postId, postInfo } from './source-url'

const post = 'https://x.com/mkpoli/status/2119010548327334386'

describe('post links', () => {
  test('drop the share tracking from a post link', () => {
    expect(cleanSourceUrl(`${post}?a=d47PdKKaof_S9ZTqrxU&s=20`)).toBe(post)
    expect(cleanSourceUrl(`https://twitter.com/mkpoli/statuses/2119010548327334386?s=20`)).toBe('https://twitter.com/mkpoli/statuses/2119010548327334386')
  })

  test('keep parameters that are not share tracking', () => {
    expect(cleanSourceUrl(`${post}?a=1&lang=ja&s=20`)).toBe(`${post}?lang=ja`)
  })

  test('leave links from other sites alone', () => {
    const link = 'https://example.org/source?a=1&s=20'
    expect(cleanSourceUrl(link)).toBe(link)
    expect(postId(link)).toBeNull()
  })

  test('read post links in their several forms', () => {
    expect(postId(post)).toBe('2119010548327334386')
    expect(postId(`${post}/photo/1`)).toBe('2119010548327334386')
    expect(postId('https://x.com/i/web/status/2119010548327334386')).toBe('2119010548327334386')
    expect(postId('https://mobile.twitter.com/mkpoli/status/2119010548327334386')).toBe('2119010548327334386')
    expect(postId('https://x.com.example.com/mkpoli/status/2119010548327334386')).toBeNull()
  })
})

describe('post photos', () => {
  test('take the first photo the API reports', () => {
    const payload = {
      code: 200,
      tweet: {
        media: {
          all: [{ type: 'photo', url: 'https://pbs.twimg.com/media/one.jpg?name=orig', width: 2114, height: 1240 }],
          photos: [
            { type: 'photo', url: 'https://pbs.twimg.com/media/one.jpg?name=orig', width: 2114, height: 1240 },
            { type: 'photo', url: 'https://pbs.twimg.com/media/two.jpg?name=orig' },
          ],
        },
      },
    }
    expect(firstPhoto(payload)).toEqual({ url: 'https://pbs.twimg.com/media/one.jpg?name=orig', width: 2114, height: 1240 })
  })

  test('ignore videos and other image hosts', () => {
    expect(firstPhoto({ tweet: { media: { all: [{ type: 'video', url: 'https://pbs.twimg.com/media/clip.jpg' }] } } })).toBeNull()
    expect(firstPhoto({ tweet: { media: { all: [{ type: 'photo', url: 'https://example.org/one.jpg' }] } } })).toBeNull()
    expect(firstPhoto({ tweet: {} })).toBeNull()
  })
})

describe('post fields', () => {
  test('fill the citation fields from the post', () => {
    const payload = {
      tweet: {
        text: '見つけた https://t.co/abc',
        raw_text: { text: '見つけた https://t.co/abc', display_text_range: [0, 4] },
        author: { screen_name: 'mkpoli', name: 'まくぽり' },
      },
    }
    expect(postInfo(payload)).toEqual({
      place: 'X',
      provider: '@mkpoli',
      providerUrl: 'https://x.com/mkpoli',
      title: '見つけた',
    })
  })

  test('use the full text and drop a trailing media link when the range is absent', () => {
    expect(postInfo({ tweet: { text: 'A post https://t.co/abc', author: { screen_name: 'mkpoli' } } })).toMatchObject({ title: 'A post' })
  })

  test('keep the title within 300 characters', () => {
    expect(postInfo({ tweet: { text: 'あ'.repeat(301), author: { screen_name: 'mkpoli' } } })?.title).toHaveLength(300)
  })

  test('do not split an emoji at the title limit', () => {
    const title = postInfo({ tweet: { text: `a${'😀'.repeat(200)}`, author: { screen_name: 'mkpoli' } } })?.title ?? ''
    expect(title.length).toBeLessThanOrEqual(300)
    expect(title.startsWith('a')).toBe(true)
    expect([...title.slice(1)].every(character => character === '😀')).toBe(true)
  })

  test('leave the provider empty when the author is missing', () => {
    expect(postInfo({ tweet: { text: 'A post' } })).toEqual({ place: 'X', provider: null, providerUrl: null, title: 'A post' })
  })

  test('answer null without a post', () => {
    expect(postInfo({})).toBeNull()
    expect(postInfo(null)).toBeNull()
  })
})
