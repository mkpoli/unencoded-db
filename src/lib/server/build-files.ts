// The adapter's headers keep every answer under /_app/immutable/ for a year, a missing file's too. A file
// asked for while a deploy is under way can be missing for a moment, so its answer is not kept.
export function uncachedWhenMissing(request: Request, response: Response) {
  if (response.status < 400 || !new URL(request.url).pathname.startsWith('/_app/immutable/')) return response
  const answer = new Response(response.body, response)
  answer.headers.set('cache-control', 'no-store')
  return answer
}
