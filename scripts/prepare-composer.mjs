// ids-input imports the drawing engine as `@han-compose/composer`, so that name links to the installed
// `han-compose` and the page holds one engine.
import { mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'

const modules = join(process.cwd(), 'node_modules')
const alias = join(modules, '@han-compose', 'composer')

mkdirSync(join(modules, '@han-compose'), { recursive: true })
rmSync(alias, { recursive: true, force: true })
symlinkSync(join(modules, 'han-compose'), alias, 'junction')
