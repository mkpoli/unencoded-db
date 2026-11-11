export function lookupIdsHints(
  ids: string,
  encodedMatch: (ids: string) => Promise<string | null>,
  setEncoded: (value: string | null) => void,
  setSame: (value: { id: number }[]) => void,
) {
  let live = true
  const controller = new AbortController()
  void encodedMatch(ids).catch(() => null).then(found => {
    if (live) setEncoded(found)
  })
  void fetch(`/api/match?ids=${encodeURIComponent(ids)}`, { signal: controller.signal })
    .then(r => r.ok ? r.json() : [])
    .catch(() => [])
    .then(answer => {
      if (live && Array.isArray(answer)) setSame(answer.filter((item): item is { id: number } => typeof item?.id === 'number'))
    })
  return () => { live = false; controller.abort() }
}
