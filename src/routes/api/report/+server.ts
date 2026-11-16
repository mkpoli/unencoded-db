import { json } from '@sveltejs/kit'
import { guardWrite } from '$lib/server/guard'
import type { RequestHandler } from './$types'

// A composition report goes to the `ids-reports` Worker, which checks it and files it as an issue. The
// binding is absent from a local `vite dev`, or the Worker behind it is not running.
export const POST: RequestHandler = async (event) => {
  if (event.platform?.env) await guardWrite(event, 'EDITS')
  const intake = event.platform?.env.REPORT
  const unavailable = () => json({ error: 'unavailable', message: 'Reports cannot be sent from here.' }, { status: 503 })
  if (!intake) return unavailable()
  // A local run binds the service to a Worker that is not running, and the call throws.
  try {
    const answer = await intake.fetch(new Request(new URL('/', event.url), event.request))
    // The answer is rebuilt as this runtime's own Response, which a local proxy's is not.
    return new Response(answer.body, { status: answer.status, headers: answer.headers })
  } catch { return unavailable() }
}
