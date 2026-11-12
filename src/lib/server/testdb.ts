import { Database } from 'bun:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// A D1 over SQLite with the migrations applied: in memory for tests, or a file to build a database in.
export function openTestDb() {
  const raw = new Database(':memory:')
  const migrations = join(import.meta.dir, '../../../migrations')
  for (const name of readdirSync(migrations).sort()) raw.exec(readFileSync(join(migrations, name), 'utf8'))
  const db = {
    async batch(statements: { sync(): unknown[] }[]) {
      return raw.transaction(() => statements.map(statement => ({ results: statement.sync() })))()
    },
    prepare(sql: string) {
      const make = (values: unknown[]) => {
        const statement = raw.prepare(sql)
        return {
          sql, values,
          bind: (...more: unknown[]) => make(more),
          all: async () => ({ results: statement.all(...(values as never[])) }),
          first: async () => statement.get(...(values as never[])) ?? null,
          run: async () => statement.run(...(values as never[])),
          sync: () => statement.all(...(values as never[])),
        }
      }
      return make([])
    },
  } as unknown as D1Database
  return { db, raw }
}
