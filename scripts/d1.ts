import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export function executeD1(where: string, ...args: string[]) {
  const run = Bun.spawnSync(['bunx', 'wrangler', 'd1', 'execute', 'DB', where, '--yes', ...args], { cwd: join(import.meta.dir, '..') })
  if (run.exitCode !== 0) throw new Error(run.stderr.toString() || run.stdout.toString())
  return run.stdout.toString()
}

export function importD1(where: string, sql: string) {
  const folder = mkdtempSync(join(tmpdir(), 'citation-sweep-'))
  try {
    const file = join(folder, 'sweep.sql')
    writeFileSync(file, sql)
    executeD1(where, '--file', file)
  } finally { rmSync(folder, { recursive: true, force: true }) }
}
