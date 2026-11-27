// One copy per archive is the usual case. The cap keeps a source page from filling with links.
export const ARCHIVES_MAX = 10
// An archive address carries the address it copies, so it runs longer than most links.
export const ARCHIVE_URL_MAX = 2000

// The stored spelling of an archive address: an http(s) URL as the URL parser writes it, or null.
// An address with a user name is refused, since it can show one host and open another.
export function archiveUrl(text: string) {
  const trimmed = text.trim()
  if (!trimmed || trimmed.length > ARCHIVE_URL_MAX) return null
  let url: URL
  try { url = new URL(trimmed) } catch { return null }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) return null
  return url.href.length > ARCHIVE_URL_MAX ? null : url.href
}

// A copy is named by its archive's host, with its path and query when the list has another copy there.
export function archiveLinks(archives: readonly string[]) {
  const urls = archives.map(archive => new URL(archive))
  return urls.map(url => ({ href: url.href, label: urls.filter(other => other.host === url.host).length > 1 ? `${url.host}${url.pathname}${url.search}` : url.host }))
}
