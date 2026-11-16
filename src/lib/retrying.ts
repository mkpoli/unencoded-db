/** A load made once and shared; a load that fails is forgotten, so the next ask tries again. */
export function retrying<T>(load: () => Promise<T>): () => Promise<T> {
  let held: Promise<T> | null = null
  return () => held ??= load().catch(error => { held = null; throw error })
}
