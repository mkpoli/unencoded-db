// Tests run offline: a request to another host fails at once, so a test cannot wait on a service or depend on it.
// A test that needs an answer stubs `fetch` itself.
const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//
const real = globalThis.fetch
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : String(input)
  if (/^https?:/.test(url) && !local.test(url)) throw new Error(`Tests run offline: ${url}`)
  return real(input as RequestInfo, init)
}) as typeof fetch
