/**
 * An isolated OpenFox for exploratory browser tests: in-memory database, mock
 * LLM, throw-away config, the production web build, a fixed port. Nothing here
 * touches the real data directory.
 *
 *   npm run build && npx tsx e2e-playwright/explore/server.ts
 */
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'

const dir = process.env['EXPLORE_DIR'] ?? mkdtempSync(join(tmpdir(), 'openfox-explore-'))
mkdirSync(dir, { recursive: true })
process.env['OPENFOX_MOCK_LLM'] ??= 'true'
process.env['OPENFOX_DB_PATH'] ??= ':memory:'
process.env['OPENFOX_LOG_LEVEL'] = 'warn'
process.env['OPENFOX_HOST'] = '127.0.0.1'
process.env['OPENFOX_DATA_DIR'] = join(dir, 'data')

const { loadConfig } = await import('../../src/server/config.js')
// The built server, not the sources: only the build resolves the web assets.
const { createServerHandle } = (await import('../../dist/server/index.js')) as {
  createServerHandle: typeof import('../../src/server/index.js').createServerHandle
}

const config = loadConfig()
config.mode = 'test'
config.globalConfigPath = join(dir, 'config.json')
// New projects are created under the workdir: keep them in the throw-away directory.
const projects = join(dir, 'projects')
mkdirSync(projects, { recursive: true })
config.workdir = projects
// The create-project dialog takes its parent folder from the global config.
if (!existsSync(config.globalConfigPath))
  writeFileSync(
    config.globalConfigPath,
    JSON.stringify({
      providers: [],
      server: { port: 10770, host: '127.0.0.1', openBrowser: false },
      workspace: { workdir: projects },
    }),
  )

const handle = await createServerHandle(config)
const port = Number(process.env['EXPLORE_PORT'] ?? 10770)
await handle.start(port)
console.log(`explore server ready on http://127.0.0.1:${port} (state in ${dir})`)
