// A token for an agent that has no browser to sign in with, such as a chat bot: a new person of the
// given name, and a year's bearer token for the MCP endpoint, written to a file only its owner reads.
// The token itself is never printed; the database keeps its hash.
//
//   bun scripts/issue-agent-token.ts --local|--remote --name <name> --out <file>
import { createHash } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { importD1 } from './d1'

// As in src/lib/server: a person's name is 1 to 40 characters, and a token is good for a year.
const NAME_MAX = 40
const TOKEN_LIFE = 365 * 24 * 60 * 60 * 1000

const USAGE = 'usage: bun scripts/issue-agent-token.ts --local|--remote --name <name> --out <file>'
const args = process.argv.slice(2)
const where = args.find(arg => arg === '--local' || arg === '--remote')
const value = (flag: string) => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined
const given = (value('--name') ?? '').normalize('NFC').replace(/\s+/gu, ' ').trim()
const name = given.length >= 1 && given.length <= NAME_MAX ? given : null
const out = value('--out')
if (!where || !name || !out || args.length !== 5) throw new Error(USAGE)
if (existsSync(out)) throw new Error(`${out} exists already; a token is never written over another.`)

// Text goes in as bytes, so no name can end the statement it sits in.
const literal = (text: string) => `CAST(X'${Buffer.from(text).toString('hex')}' AS TEXT)`
const hex = (bytes: number) => [...crypto.getRandomValues(new Uint8Array(bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('')

const token = hex(32)
const person = hex(6)
const client = crypto.randomUUID()
const at = new Date().toISOString()

// The file is made first: a token in the database that nobody holds is only clutter, a token on disk
// that the database does not know opens nothing.
writeFileSync(out, `${token}\n`, { mode: 0o600, flag: 'wx' })
// The client has no redirect address, so nobody can use it to sign in through a browser.
importD1(where, [
  `INSERT INTO people(id, name, atlas_sub, role, created_at) VALUES(${literal(person)}, ${literal(name)}, NULL, 'member', ${literal(at)});`,
  `INSERT INTO agent_clients(id, name, redirect_uris, created_at, used_at) VALUES(${literal(client)}, ${literal(name)}, '[]', ${literal(at)}, ${literal(at)});`,
  `INSERT INTO agent_tokens(token_hash, client, person, created_at) VALUES(${literal(createHash('sha256').update(token).digest('hex'))}, ${literal(client)}, ${literal(person)}, ${literal(at)});`,
].join('\n'))

console.log(JSON.stringify({ person, name, client, token_file: out, expires_at: new Date(Date.parse(at) + TOKEN_LIFE).toISOString() }, null, 2))
