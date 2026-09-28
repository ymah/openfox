// Copies static assets into dist/ after tsup. Replaces the POSIX mkdir/cp
// chain in build:server so the build works on Windows (cmd.exe) too.
import { cpSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

function copyFiltered(src, dest, ext) {
  mkdirSync(dest, { recursive: true })
  for (const f of readdirSync(src)) {
    if (f.endsWith(ext)) cpSync(join(src, f), join(dest, f))
  }
}

copyFiltered('src/server/commands/defaults', 'dist/command-defaults', '.md')
cpSync('src/server/skills/defaults', 'dist/skill-defaults', { recursive: true })
copyFiltered('src/server/agents/defaults', 'dist/agent-defaults', '.md')
copyFiltered('src/server/workflows/defaults', 'dist/workflow-defaults', '.json')
// Bundled first-party plugins: copied whole (JS entry points plus their .md and
// .json data), so each plugin keeps the same internal layout in dev and in the
// published package. Recursive, not copyFiltered, which keeps a single extension.
cpSync('src/server/plugins/bundled', 'dist/bundled-plugins', { recursive: true })
cpSync('src/server/lsp/languages.json', 'dist/languages.json')
cpSync('CHANGELOG.md', 'dist/CHANGELOG.md')
cpSync('package.json', 'dist/package.json')
cpSync('plugins-registry.json', 'dist/plugins-registry.json')
cpSync('src/server/public', 'dist/server/public', { recursive: true })
