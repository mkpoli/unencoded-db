// Fetches the pictures of a sighting another form starts from, sequentially so they keep their order,
// holding `onBusy` across the whole import and continuing past any individual picture that fails.
export function loadSeedPictures(
  urls: readonly string[],
  add: (blob: Blob) => Promise<void> | undefined,
  onBusy: (busy: boolean) => void,
  fetcher: typeof fetch = fetch,
): () => void {
  if (!urls.length) return () => {}
  const controller = new AbortController()
  onBusy(true)
  void (async () => {
    try {
      for (const url of urls) {
        if (controller.signal.aborted) return
        try {
          const response = await fetcher(url, { signal: controller.signal })
          if (controller.signal.aborted) return
          if (!response.ok) continue
          const blob = await response.blob()
          if (controller.signal.aborted) return
          await add(blob)
        } catch {
          if (controller.signal.aborted) return
        }
      }
    } finally {
      if (!controller.signal.aborted) onBusy(false)
    }
  })()
  return () => controller.abort()
}
