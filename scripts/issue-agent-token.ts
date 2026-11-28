// A token for an agent that has no browser to sign in with, such as a chat bot: a new person of the
// given name (or an existing person by id), and a year's bearer token for the MCP endpoint, written
// to a file only its owner reads. Passing --moderator grants moderator role.
// The token itself is never printed; the database keeps its hash.
//
//   bun scripts/issue-agent-token.ts --local|--remote (--name <name> | --person <id>) --out <file> [--moderator]
import { createHash } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { executeD1, importD1 } from './d1'

// As in src/lib/server: a person's name is 1 to 40 characters, and a token is good for a year.
const NAME_MAX = 40
const PERSON_ID = /^[a-zA-Z0-9_-]{1,64}$/
const TOKEN_LIFE = 365 * 24 * 60 * 60 * 1000

export const USAGE = 'usage: bun scripts/issue-agent-token.ts --local|--remote (--name <name> | --person <id>) --out <file> [--moderator]'

export type ParsedArgs = {
  where: '--local' | '--remote'
  name: string | null
  person: string | null
  out: string
  moderator: boolean
}

export function parseIssueTokenArgs(args: readonly string[]): ParsedArgs {
  let where: '--local' | '--remote' | null = null
  let rawName: string | null = null
  let rawPerson: string | null = null
  let out: string | null = null
  let moderator = false

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--local' || arg === '--remote') {
      if (where) throw new Error(USAGE)
      where = arg
    } else if (arg === '--moderator') {
      if (moderator) throw new Error(USAGE)
      moderator = true
    } else if (arg === '--name') {
      if (rawName !== null || i + 1 >= args.length || args[i + 1].startsWith('--')) throw new Error(USAGE)
      rawName = args[++i]
    } else if (arg === '--person') {
      if (rawPerson !== null || i + 1 >= args.length || args[i + 1].startsWith('--')) throw new Error(USAGE)
      rawPerson = args[++i]
    } else if (arg === '--out') {
      if (out !== null || i + 1 >= args.length || args[i + 1].startsWith('--')) throw new Error(USAGE)
      out = args[++i]
    } else {
      throw new Error(USAGE)
    }
  }

  if (!where || !out || (rawName === null) === (rawPerson === null)) throw new Error(USAGE)
  let name: string | null = null
  let person: string | null = null
  if (rawName !== null) {
    const cleaned = rawName.normalize('NFC').replace(/\s+/gu, ' ').trim()
    if (cleaned.length < 1 || cleaned.length > NAME_MAX) throw new Error(USAGE)
    name = cleaned
  }
  if (rawPerson !== null) {
    const cleaned = rawPerson.trim()
    if (!PERSON_ID.test(cleaned)) throw new Error(USAGE)
    person = cleaned
  }
  return { where, name, person, out, moderator }
}

// Text goes in as bytes, so no name can end the statement it sits in.
export const sqlLiteral = (text: string) => `CAST(X'${Buffer.from(text).toString('hex')}' AS TEXT)`
const hex = (bytes: number) => [...crypto.getRandomValues(new Uint8Array(bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('')

export function buildIssueTokenSql(options: {
  person: string
  name: string
  client: string
  token: string
  at: string
  moderator: boolean
  existingPerson: boolean
}): string {
  const { person, name, client, token, at, moderator, existingPerson } = options
  const role = moderator ? 'moderator' : 'member'
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const statements: string[] = []
  if (existingPerson) {
    if (moderator) {
      statements.push(`UPDATE people SET role = 'moderator' WHERE id = ${sqlLiteral(person)} AND banned_at IS NULL;`)
    }
  } else {
    statements.push(`INSERT INTO people(id, name, atlas_sub, role, created_at) VALUES(${sqlLiteral(person)}, ${sqlLiteral(name)}, NULL, ${sqlLiteral(role)}, ${sqlLiteral(at)});`)
  }
  // The client has no redirect address, so nobody can use it to sign in through a browser.
  statements.push(
    `INSERT INTO agent_clients(id, name, redirect_uris, created_at, used_at) VALUES(${sqlLiteral(client)}, ${sqlLiteral(name)}, '[]', ${sqlLiteral(at)}, ${sqlLiteral(at)});`,
    `INSERT INTO agent_tokens(token_hash, client, person, created_at) VALUES(${sqlLiteral(tokenHash)}, ${sqlLiteral(client)}, ${sqlLiteral(person)}, ${sqlLiteral(at)});`,
  )
  return statements.join('\n')
}

export type ExistingPersonRow = {
  id: string
  name: string
  role: string
  banned_at: string | null
  merged_into: string | null
  atlas_sub: string | null
  agent: number
}

export function validateExistingPerson(id: string, row: ExistingPersonRow | undefined): ExistingPersonRow {
  if (!row) throw new Error(`Person ${id} does not exist.`)
  if (row.merged_into) throw new Error(`Person ${id} was merged into ${row.merged_into}; pass --person ${row.merged_into} instead.`)
  if (row.banned_at) throw new Error(`Person ${id} is banned and cannot be issued a token.`)
  if (!row.atlas_sub && !row.agent) throw new Error(`Person ${id} is an anonymous browser account and cannot be issued an agent token.`)
  return row
}

function lookupExistingPerson(where: '--local' | '--remote', id: string): ExistingPersonRow {
  const stdout = executeD1(where, '--json', '--command', `SELECT id, name, role, banned_at, merged_into, atlas_sub, agent FROM people WHERE id = ${sqlLiteral(id)}`)
  const parsed = JSON.parse(stdout) as { results?: ExistingPersonRow[] }[]
  return validateExistingPerson(id, parsed[0]?.results?.[0])
}

if (import.meta.main) {
  const parsed = parseIssueTokenArgs(process.argv.slice(2))
  if (existsSync(parsed.out)) throw new Error(`${parsed.out} exists already; a token is never written over another.`)

  let person: string
  let name: string
  let role: string
  let existingPerson = false

  if (parsed.person) {
    const existing = lookupExistingPerson(parsed.where, parsed.person)
    person = existing.id
    name = existing.name
    role = parsed.moderator ? 'moderator' : existing.role
    existingPerson = true
  } else {
    person = hex(6)
    name = parsed.name!
    role = parsed.moderator ? 'moderator' : 'member'
  }

  const token = hex(32)
  const client = crypto.randomUUID()
  const at = new Date().toISOString()

  // The file is made first: a token in the database that nobody holds is only clutter, a token on disk
  // that the database does not know opens nothing.
  writeFileSync(parsed.out, `${token}\n`, { mode: 0o600, flag: 'wx' })
  importD1(parsed.where, buildIssueTokenSql({ person, name, client, token, at, moderator: parsed.moderator, existingPerson }))

  console.log(JSON.stringify({ person, name, role, client, token_file: parsed.out, expires_at: new Date(Date.parse(at) + TOKEN_LIFE).toISOString() }, null, 2))
}
