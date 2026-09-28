// Copies static assets into dist/ after tsup. Replaces the POSIX mkdir/cp
// chain in build:server so the build works on Windows (cmd.exe) too.
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

// tsup's `clean` only removes the bundles it owns, so an asset directory keeps
// whatever a previous build put there. Deleting each destination first makes the
// copy idempotent — otherwise a definition that moved (or was deleted) lingers in
// dist/ and ships, e.g. a skill present both in skill-defaults and in a bundled
// plugin, registering the same id twice.
function copyDir(src, dest) {
  rmSync(dest, { recursive: true, force: true })
  cpSync(src, dest, { recursive: true })
}

function copyFiltered(src, dest, ext) {
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })
  for (const f of readdirSync(src)) {
    if (f.endsWith(ext)) cpSync(join(src, f), join(dest, f))
  }
}

copyFiltered('src/server/commands/defaults', 'dist/command-defaults', '.md')
copyDir('src/server/skills/defaults', 'dist/skill-defaults')
copyFiltered('src/server/agents/defaults', 'dist/agent-defaults', '.md')
copyFiltered('src/server/workflows/defaults', 'dist/workflow-defaults', '.json')
// Bundled first-party plugins: copied whole (JS entry points plus their .md and
// .json data), so each plugin keeps the same internal layout in dev and in the
// published package. Recursive, not copyFiltered, which keeps a single extension.
copyDir('src/server/plugins/bundled', 'dist/bundled-plugins')
cpSync('src/server/lsp/languages.json', 'dist/languages.json')
cpSync('CHANGELOG.md', 'dist/CHANGELOG.md')
cpSync('package.json', 'dist/package.json')
cpSync('plugins-registry.json', 'dist/plugins-registry.json')
copyDir('src/server/public', 'dist/server/public')
