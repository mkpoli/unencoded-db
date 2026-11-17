// The Model Context Protocol endpoint: an agent connects here to search the records and to add characters
// and sightings. It speaks the Streamable HTTP transport without a stream, so each POST is one JSON-RPC
// message answered with one JSON body (https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).
//
// The site takes anonymous writes and names each writer by a token: a browser keeps it in a cookie, and an
// agent keeps the `Mcp-Session-Id` it is handed on `initialize`. The id decides only whose name a write
// carries. The first write of a connection makes that anonymous person. An agent that signed in
// (`$lib/server/agents`) sends a bearer token in its place, and writes as the person who allowed it.
import { json } from '@sveltejs/kit'
import { resourceMetadata } from '$lib/server/agents'
import { tagList } from '$lib/server/tags'
import { env } from '$lib/server/guard'
import { AGENT_SESSION, newSessionToken } from '$lib/server/people'
import { callTool, INSTRUCTIONS, toolList } from './_tools.server'
import type { RequestHandler } from './$types'

// Newest first. A client that asks for another revision is answered with the newest.
const VERSIONS = ['2025-11-25', '2025-06-18']
const SERVER = { name: 'rare-character-compendium', title: '珍字集覽 Rare Character Compendium', version: '1.0.0' }

const PARSE_ERROR = -32700, INVALID_REQUEST = -32600, METHOD_NOT_FOUND = -32601, INVALID_PARAMS = -32602, INTERNAL_ERROR = -32603
type Id = string | number | null
const failure = (id: Id, code: number, message: string, status = 200) => json({ jsonrpc: '2.0', id, error: { code, message } }, { status })
const reply = (id: Id, result: unknown, headers?: HeadersInit) => json({ jsonrpc: '2.0', id, result }, { headers })
const plain = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export const POST: RequestHandler = async (event) => {
  const { headers } = event.request
  // A page of another site must not post here from a visitor's browser. A JSON body needs a preflight this
  // endpoint never grants, and a body sent as anything else is refused.
  const origin = headers.get('origin')
  if (origin && origin !== event.url.origin) return failure(null, INVALID_REQUEST, 'Forbidden origin', 403)
  if (!/^application\/json\s*(;|$)/i.test(headers.get('content-type') ?? '')) return failure(null, INVALID_REQUEST, 'Send application/json', 415)
  // A token that names no one is refused, with where to sign in again, and never read as an anonymous caller.
  if (headers.has('authorization') && !event.locals.person) {
    return json({ jsonrpc: '2.0', id: null, error: { code: INVALID_REQUEST, message: 'Invalid or expired token' } }, { status: 401, headers: { 'www-authenticate': `Bearer error="invalid_token", resource_metadata="${resourceMetadata(event)}"` } })
  }
  const version = headers.get('mcp-protocol-version')
  if (version && !VERSIONS.includes(version)) return failure(null, INVALID_REQUEST, `Unsupported protocol version: ${version}`, 400)

  let message: unknown
  try { message = await event.request.json() } catch { return failure(null, PARSE_ERROR, 'Parse error', 400) }
  // One message a request. Each write is charged to the rate limit as a request of its own.
  if (!plain(message) || message.jsonrpc !== '2.0') return failure(null, INVALID_REQUEST, 'Send one JSON-RPC 2.0 message', 400)
  const { method } = message
  const id = typeof message.id === 'string' || typeof message.id === 'number' ? message.id : null
  // A notification, or an answer to a request this server never makes.
  if (typeof method !== 'string' || id === null) return new Response(null, { status: 202 })
  const params = plain(message.params) ? message.params : {}

  switch (method) {
    case 'initialize': {
      const asked = params.protocolVersion
      return reply(id, {
        protocolVersion: typeof asked === 'string' && VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: SERVER,
        instructions: INSTRUCTIONS,
      }, { [AGENT_SESSION]: newSessionToken() })
    }
    case 'ping': return reply(id, {})
    case 'tools/list': return reply(id, { tools: toolList((await tagList(env(event).DB)).map(tag => tag.name)) })
    case 'tools/call': {
      try {
        const result = await callTool(event, params.name, params.arguments)
        return result ? reply(id, result) : failure(id, INVALID_PARAMS, `Unknown tool: ${String(params.name)}`)
      } catch (cause) {
        console.error('mcp tool failed', params.name, cause)
        return failure(id, INTERNAL_ERROR, 'Internal error')
      }
    }
    default: return failure(id, METHOD_NOT_FOUND, `Method not found: ${method}`)
  }
}
