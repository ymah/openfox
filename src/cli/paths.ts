import { homedir, platform } from 'node:os'
import { join } from 'node:path'
import { mkdir, access } from 'node:fs/promises'
import type { Mode } from './main.js'

export function getGlobalConfigDir(mode: Mode): string {
  if (mode === 'test') {
    return join(process.cwd(), 'e2e', '.openfox-test')
  }
  const suffix = mode === 'development' ? '-dev' : ''
  const home = homedir()

  switch (platform()) {
    case 'darwin':
      return join(home, 'Library', 'Application Support', `openfox${suffix}`)
    case 'win32':
      return join(process.env['APPDATA'] ?? join(home, 'AppData', 'Roaming'), `openfox${suffix}`)
    default:
      return join(process.env['XDG_CONFIG_HOME'] ?? join(home, '.config'), `openfox${suffix}`)
  }
}

export function getGlobalConfigPath(mode: Mode): string {
  return join(getGlobalConfigDir(mode), 'config.json')
}

export function getAuthConfigPath(mode: Mode): string {
  return join(getGlobalConfigDir(mode), 'auth.json')
}

export function getAuthKeyPath(mode: Mode): string {
  return join(getGlobalConfigDir(mode), 'auth.key')
}

/**
 * Where the database and git worktrees live. `OPENFOX_DATA_DIR` overrides every
 * platform default: tests use it so they can never write into the user's real
 * data directory (they used to — hundreds of orphaned worktrees ended up there),
 * and containers can use it to relocate all mutable state with one variable.
 */
export function getGlobalDataDir(mode: Mode): string {
  const override = process.env['OPENFOX_DATA_DIR']?.trim()
  if (override) return override

  const suffix = mode === 'development' ? '-dev' : ''
  const home = homedir()

  switch (platform()) {
    case 'darwin':
      return join(home, 'Library', 'Application Support', `openfox${suffix}`)
    case 'win32':
      return join(process.env['LOCALAPPDATA'] ?? join(home, 'AppData', 'Local'), `openfox${suffix}`)
    default:
      return join(process.env['XDG_DATA_HOME'] ?? join(home, '.local', 'share'), `openfox${suffix}`)
  }
}

export function getDatabasePath(mode: Mode): string {
  return join(getGlobalDataDir(mode), 'sessions.db')
}

export function getSkillsDir(mode: Mode): string {
  return join(getGlobalConfigDir(mode), 'skills')
}

export async function ensureDataDirExists(mode: Mode): Promise<void> {
  const dataDir = getGlobalDataDir(mode)
  try {
    await access(dataDir)
  } catch {
    await mkdir(dataDir, { recursive: true })
  }
}
