import { access, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

export function expandHome(path: string): string {
  if (path === '~') return homedir()
  return path.startsWith('~/') ? join(homedir(), path.slice(2)) : path
}

/**
 * Validate and resolve a user-supplied local directory path (from a
 * DirectoryBrowser selection or similar) — expands `~`, requires an
 * absolute path, and confirms it's a readable directory. Shared by every
 * route that lets the user point at an arbitrary local folder (skills
 * library, project skills/instructions import).
 */
export async function resolveLocalDirectory(path: string): Promise<string> {
  const expanded = expandHome(path)
  if (!isAbsolute(expanded)) throw new Error('Selected path must be absolute')
  const absolute = resolve(expanded)
  const info = await stat(absolute)
  if (!info.isDirectory()) throw new Error('Selected path is not a directory')
  await access(absolute, constants.R_OK)
  return absolute
}
