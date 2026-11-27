// The pages someone asks of a PDF, written as single pages and ranges: `3`, `2-4`, `1, 5-6`.

/** The pages a text names, in the order written and each once, or null when it names none inside 1…count. */
export function pagesOf(text: string, count: number): number[] | null {
  const pages: number[] = []
  for (const part of text.split(/[,、，\s]+/).filter(Boolean)) {
    const match = /^(\d{1,5})(?:\s*[-–—~〜]\s*(\d{1,5}))?$/.exec(part)
    if (!match) return null
    const first = Number(match[1]), last = Number(match[2] ?? match[1])
    if (first < 1 || last < first || last > count) return null
    for (let page = first; page <= last; page++) if (!pages.includes(page)) pages.push(page)
  }
  return pages.length ? pages : null
}
