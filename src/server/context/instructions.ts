import { readFile, access, readdir, mkdir, copyFile } from 'node:fs/promises'
import { join, dirname, basename } from 'node:path'
import { constants } from 'node:fs'
import { getSetting, SETTINGS_KEYS } from '../db/settings.js'
import { getProject } from '../db/projects.js'
import { pathExists } from '../shared/item-loader.js'
import type { InjectedFile } from '../../shared/types.js'

// ============================================================================
// Types
// ============================================================================

export interface InstructionFile {
  path: string
  source: 'agents-md' | 'global' | 'project' | 'directory'
  content?: string
}

export interface AllInstructions {
  content: string
  files: InstructionFile[]
}

export function buildLanguageInstruction(language: string | null | undefined): string | null {
  const trimmed = language?.trim()
  if (!trimmed || trimmed.toLowerCase() === 'automatic') return null
  const display = trimmed[0]!.toUpperCase() + trimmed.slice(1)
  return `## LANGUAGE\n\nAlways respond to the user in ${display}.`
}

// Filenames to look for (in order of priority within same directory)
const INSTRUCTION_FILENAMES = ['AGENTS.md', 'CLAUDE.md']

// ============================================================================
// Discovery
// ============================================================================

/**
 * Find instruction files by walking up the directory tree from workdir.
 * Returns files ordered from root to workdir (parent directories first),
 * so that files closer to the working directory can override parent instructions.
 */
export async function findInstructionFiles(workdir: string): Promise<InstructionFile[]> {
  const foundFiles: InstructionFile[] = []
  const pathsToCheck: string[] = []

  // Walk up the directory tree
  let currentDir = workdir
  while (true) {
    pathsToCheck.unshift(currentDir) // Add to front (we want root-first order)

    const parentDir = dirname(currentDir)
    // Stop if we've reached the root (dirname returns same path)
    if (parentDir === currentDir) {
      break
    }
    currentDir = parentDir
  }

  // Check each directory for instruction files
  for (const dir of pathsToCheck) {
    for (const filename of INSTRUCTION_FILENAMES) {
      const filePath = join(dir, filename)
      if (await fileExists(filePath)) {
        foundFiles.push({
          path: filePath,
          source: 'agents-md',
        })
      }
    }
  }

  return foundFiles
}

function getProjectInstructionsDir(projectDir: string): string {
  return join(projectDir, '.openfox', 'instructions')
}

/**
 * Find instruction files committed under .openfox/instructions/ — the
 * project-scoped, folder-of-many-files convention already used for
 * .openfox/skills/, .openfox/agents/, .openfox/workflows/. Unlike the
 * AGENTS.md/CLAUDE.md walk (fixed filenames, found by convention), this
 * directory only exists if something (an import, or a contributor by hand)
 * put files there — a flat listing of *.md files, sorted for determinism.
 */
export async function findProjectInstructionsDirectory(projectDir: string): Promise<InstructionFile[]> {
  const dir = getProjectInstructionsDir(projectDir)
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort()
    .map((name) => ({ path: join(dir, name), source: 'directory' as const }))
}

export interface ImportInstructionsResult {
  imported: string[]
  skipped: Array<{ name: string; reason: string }>
}

/**
 * Bulk-import instruction files from an arbitrary local directory into this
 * project's .openfox/instructions/. Copies each *.md file as-is; anything
 * else in the source directory (non-.md files) is reported in `skipped`
 * rather than silently ignored, since this is a one-time user-initiated
 * action they need feedback on, not passive discovery.
 */
export async function importInstructionsFromDirectory(
  sourceDir: string,
  projectDir: string,
): Promise<ImportInstructionsResult> {
  // jscpd:ignore-start — same setup shape as importSkillsFromDirectory
  // (registry.ts): init result arrays, readdir the source, mkdir the
  // target. The per-entry validation below is where the two genuinely
  // diverge (frontmatter parsing + directory copy vs extension check +
  // file copy), so only this shared preamble is marked.
  const imported: string[] = []
  const skipped: Array<{ name: string; reason: string }> = []

  let entries
  try {
    entries = await readdir(sourceDir, { withFileTypes: true })
  } catch {
    throw new Error(`Cannot read directory: ${sourceDir}`)
  }

  const targetDir = getProjectInstructionsDir(projectDir)
  await mkdir(targetDir, { recursive: true })
  // jscpd:ignore-end

  for (const entry of entries) {
    if (!entry.isFile()) continue // subdirectories aren't instruction files, ignored silently
    const name = entry.name
    if (!name.endsWith('.md')) {
      skipped.push({ name, reason: 'Not a .md file' })
      continue
    }
    const destination = join(targetDir, basename(name))
    if (await pathExists(destination)) {
      skipped.push({ name, reason: 'A file with this name already exists in the project' })
      continue
    }
    await copyFile(join(sourceDir, name), destination)
    imported.push(name)
  }

  return { imported, skipped }
}

/**
 * Load instruction content from files.
 * Each file's content is prefixed with a comment showing its source path.
 */
export async function loadInstructions(files: InstructionFile[]): Promise<string> {
  const contents: string[] = []

  for (const file of files) {
    try {
      const content = await readFile(file.path, 'utf-8')
      contents.push(`Instructions from: ${file.path}\n${content}`)
    } catch {
      // File doesn't exist or can't be read - skip silently
      continue
    }
  }

  return contents.join('\n')
}

/**
 * Convenience function to find and load all instruction files for a workdir.
 * Only includes AGENTS.md files, not global or project instructions.
 */
export async function getInstructionsForWorkdir(workdir: string): Promise<{
  content: string
  files: InstructionFile[]
}> {
  const files = await findInstructionFiles(workdir)
  const content = await loadInstructions(files)
  return { content, files }
}

/**
 * Load ALL instructions from all sources for a session.
 * Order: language → global → project → AGENTS.md files
 * This is the primary function that should be used when building prompts.
 */
export async function getAllInstructions(workdir: string, projectId: string): Promise<AllInstructions> {
  const sections: string[] = []
  const allFiles: InstructionFile[] = []

  // 0. Language (from settings) - always first when set
  const languageInstruction = buildLanguageInstruction(getSetting(SETTINGS_KEYS.LANGUAGE))
  if (languageInstruction) {
    sections.push(languageInstruction)
  }

  // 1. Global instructions (from settings)
  const globalInstructions = getSetting(SETTINGS_KEYS.GLOBAL_INSTRUCTIONS)
  if (globalInstructions) {
    sections.push(`## GLOBAL INSTRUCTIONS\n\n${globalInstructions}`)
    allFiles.push({ path: 'Global Instructions', source: 'global', content: globalInstructions })
  }

  // 2. Project instructions (from project record)
  const project = getProject(projectId)
  if (project?.customInstructions) {
    sections.push(`## PROJECT INSTRUCTIONS\n\n${project.customInstructions}`)
    allFiles.push({ path: `Project: ${project.name}`, source: 'project', content: project.customInstructions })
  }

  // 3. AGENTS.md/CLAUDE.md files (from filesystem) + .openfox/instructions/ —
  // both land in the same FILE INSTRUCTIONS section; loadInstructions()
  // already concatenates an arbitrary number of files cleanly, so scoping
  // the directory scan to the project's root (not `workdir`, which may be a
  // workspace/worktree path) and merging it in needs no new merge logic.
  const directoryFiles = project?.workdir ? await findProjectInstructionsDirectory(project.workdir) : []
  const agentFiles = [...(await findInstructionFiles(workdir)), ...directoryFiles]
  if (agentFiles.length > 0) {
    const agentContent = await loadInstructions(agentFiles)
    if (agentContent) {
      sections.push(`## FILE INSTRUCTIONS\n\n${agentContent}`)
      // Load content for each file
      for (const file of agentFiles) {
        try {
          const content = await readFile(file.path, 'utf-8')
          allFiles.push({ ...file, content })
        } catch {
          allFiles.push(file)
        }
      }
    }
  }

  return {
    content: sections.join('\n\n'),
    files: allFiles,
  }
}

// ============================================================================
// Helpers
// ============================================================================

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK)
    return true
  } catch {
    return false
  }
}

export function toInjectedFiles(files: InstructionFile[]): InjectedFile[] {
  return files.map((file) => ({
    path: file.path,
    content: file.content ?? '',
    source: file.source,
  }))
}
