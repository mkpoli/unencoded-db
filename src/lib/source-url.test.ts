import { expect, test } from 'bun:test'
import { isSafeSourceUrl } from './source-url'

test('unsafe snapshot URLs are rendered as text', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,x', 'https://user:pass@example.org']) expect(isSafeSourceUrl(url)).toBe(false)
  expect(isSafeSourceUrl('https://example.org/')).toBe(true)
})
