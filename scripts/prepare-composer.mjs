// The composer is a git dependency on han-compose, whose root is a workspace of its Python composer
// and the JavaScript package in js/. Build the package's data and put the workspace in the package's
// place, so `@han-compose/composer` resolves as it does from npm.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const modules = join(process.cwd(), 'node_modules')
const root = join(modules, '@han-compose', 'composer')
const manifest = join(root, 'package.json')
if (!existsSync(manifest)) process.exit(0)
if (JSON.parse(readFileSync(manifest, 'utf8')).name === '@han-compose/composer') process.exit(0)
const workspace = join(root, 'js')
if (!existsSync(workspace)) {
  console.error('@han-compose/composer is a git checkout without its js/ package. Install a commit that has it.')
  process.exit(1)
}

execFileSync(process.execPath, [join(workspace, 'scripts/data.mjs')], { cwd: root, stdio: 'inherit' })
const staged = join(modules, '@han-compose', 'composer-js')
rmSync(staged, { recursive: true, force: true })
renameSync(workspace, staged)
rmSync(root, { recursive: true, force: true })
renameSync(staged, root)
