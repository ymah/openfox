import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadConfig } from '../config.js'
import { closeDatabase, initDatabase } from '../db/index.js'
import { createProject, updateProject } from '../db/projects.js'
import { setSetting, SETTINGS_KEYS } from '../db/settings.js'
import {
  buildLanguageInstruction,
  findInstructionFiles,
  findProjectInstructionsDirectory,
  getAllInstructions,
  getInstructionsForWorkdir,
  importInstructionsFromDirectory,
  loadInstructions,
  type InstructionFile,
} from './instructions.js'

describe('instructions', () => {
  let testDir: string

  beforeEach(async () => {
    closeDatabase()
    const config = loadConfig()
    config.database.path = ':memory:'
    initDatabase(config)
    // Create a unique temp directory for each test
    testDir = join(tmpdir(), `openfox-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    closeDatabase()
    // Clean up temp directory
    await rm(testDir, { recursive: true, force: true })
  })

  describe('findInstructionFiles', () => {
    it('returns empty array when no instruction files exist', async () => {
      const result = await findInstructionFiles(testDir)
      expect(result).toEqual([])
    })

    it('finds AGENTS.md in workdir', async () => {
      await writeFile(join(testDir, 'AGENTS.md'), '# Agent instructions')

      const result = await findInstructionFiles(testDir)

      expect(result).toHaveLength(1)
      expect(result[0]?.path).toBe(join(testDir, 'AGENTS.md'))
      expect(result[0]?.source).toBe('agents-md')
    })

    it('finds CLAUDE.md in workdir', async () => {
      await writeFile(join(testDir, 'CLAUDE.md'), '# Claude instructions')

      const result = await findInstructionFiles(testDir)

      expect(result).toHaveLength(1)
      expect(result[0]?.path).toBe(join(testDir, 'CLAUDE.md'))
      expect(result[0]?.source).toBe('agents-md')
    })

    it('finds both AGENTS.md and CLAUDE.md in same directory', async () => {
      await writeFile(join(testDir, 'AGENTS.md'), '# Agent instructions')
      await writeFile(join(testDir, 'CLAUDE.md'), '# Claude instructions')

      const result = await findInstructionFiles(testDir)

      expect(result).toHaveLength(2)
      // AGENTS.md comes before CLAUDE.md alphabetically
      expect(result.map((f) => f.path)).toContain(join(testDir, 'AGENTS.md'))
      expect(result.map((f) => f.path)).toContain(join(testDir, 'CLAUDE.md'))
    })

    it('walks up directory tree to find instruction files', async () => {
      // Create nested structure: testDir/project/src
      const projectDir = join(testDir, 'project')
      const srcDir = join(projectDir, 'src')
      await mkdir(srcDir, { recursive: true })

      // Put AGENTS.md in root
      await writeFile(join(testDir, 'AGENTS.md'), '# Root instructions')
      // Put CLAUDE.md in project
      await writeFile(join(projectDir, 'CLAUDE.md'), '# Project instructions')

      // Search from src directory
      const result = await findInstructionFiles(srcDir)

      expect(result).toHaveLength(2)
      // Files should be ordered from root to workdir (parent-first)
      expect(result[0]?.path).toBe(join(testDir, 'AGENTS.md'))
      expect(result[1]?.path).toBe(join(projectDir, 'CLAUDE.md'))
    })

    it('stops at filesystem root', async () => {
      // This test just ensures we don't infinite loop
      const result = await findInstructionFiles(testDir)
      expect(result).toBeInstanceOf(Array)
    })

    it('orders files from root to workdir (parent directories first)', async () => {
      const projectDir = join(testDir, 'project')
      await mkdir(projectDir, { recursive: true })

      await writeFile(join(testDir, 'AGENTS.md'), '# Root')
      await writeFile(join(projectDir, 'AGENTS.md'), '# Project')

      const result = await findInstructionFiles(projectDir)

      expect(result).toHaveLength(2)
      expect(result[0]?.path).toBe(join(testDir, 'AGENTS.md'))
      expect(result[1]?.path).toBe(join(projectDir, 'AGENTS.md'))
    })
  })

  describe('loadInstructions', () => {
    it('returns empty string when no files provided', async () => {
      const result = await loadInstructions([])
      expect(result).toBe('')
    })

    it('loads and concatenates file contents', async () => {
      await writeFile(join(testDir, 'AGENTS.md'), '# Agent instructions\nDo this.')
      await writeFile(join(testDir, 'CLAUDE.md'), '# Claude instructions\nDo that.')

      const files: InstructionFile[] = [
        { path: join(testDir, 'AGENTS.md'), source: 'agents-md' },
        { path: join(testDir, 'CLAUDE.md'), source: 'agents-md' },
      ]

      const result = await loadInstructions(files)

      expect(result).toContain('# Agent instructions')
      expect(result).toContain('Do this.')
      expect(result).toContain('# Claude instructions')
      expect(result).toContain('Do that.')
    })

    it('includes source path comments', async () => {
      await writeFile(join(testDir, 'AGENTS.md'), 'Instructions here')

      const files: InstructionFile[] = [{ path: join(testDir, 'AGENTS.md'), source: 'agents-md' }]

      const result = await loadInstructions(files)

      expect(result).toContain(`Instructions from: ${join(testDir, 'AGENTS.md')}`)
    })

    it('handles non-existent files gracefully', async () => {
      const files: InstructionFile[] = [{ path: join(testDir, 'nonexistent.md'), source: 'agents-md' }]

      const result = await loadInstructions(files)
      expect(result).toBe('')
    })
  })

  describe('buildLanguageInstruction', () => {
    it('returns a LANGUAGE section for a preset language', () => {
      const result = buildLanguageInstruction('French')
      expect(result).toBe('## LANGUAGE\n\nAlways respond to the user in French.')
    })

    it('capitalizes the first letter of custom languages', () => {
      expect(buildLanguageInstruction('german')).toBe('## LANGUAGE\n\nAlways respond to the user in German.')
      expect(buildLanguageInstruction('  spanish  ')).toBe('## LANGUAGE\n\nAlways respond to the user in Spanish.')
    })

    it('returns null for automatic, empty, and null values', () => {
      expect(buildLanguageInstruction('automatic')).toBeNull()
      expect(buildLanguageInstruction('Automatic')).toBeNull()
      expect(buildLanguageInstruction('')).toBeNull()
      expect(buildLanguageInstruction('   ')).toBeNull()
      expect(buildLanguageInstruction(null)).toBeNull()
      expect(buildLanguageInstruction(undefined)).toBeNull()
    })
  })

  describe('higher level helpers', () => {
    it('returns workdir instructions with discovered files', async () => {
      await writeFile(join(testDir, 'AGENTS.md'), '# Agent instructions')

      const result = await getInstructionsForWorkdir(testDir)

      expect(result.files).toHaveLength(1)
      expect(result.content).toContain('# Agent instructions')
    })

    it('combines global, project, and file instructions in order', async () => {
      const project = createProject('OpenFox', testDir)
      setSetting(SETTINGS_KEYS.GLOBAL_INSTRUCTIONS, 'Global rule')
      updateProject(project.id, { customInstructions: 'Project rule' })
      await writeFile(join(testDir, 'AGENTS.md'), '# Local instructions\nUse tests')

      const result = await getAllInstructions(testDir, project.id)

      expect(result.content).toContain('## GLOBAL INSTRUCTIONS\n\nGlobal rule')
      expect(result.content).toContain('## PROJECT INSTRUCTIONS\n\nProject rule')
      expect(result.content).toContain('## FILE INSTRUCTIONS')
      expect(result.files).toEqual([
        { path: 'Global Instructions', source: 'global', content: 'Global rule' },
        { path: 'Project: OpenFox', source: 'project', content: 'Project rule' },
        { path: join(testDir, 'AGENTS.md'), source: 'agents-md', content: '# Local instructions\nUse tests' },
      ])
    })

    it('injects the LANGUAGE section first when a language is set', async () => {
      const project = createProject('OpenFox', testDir)
      setSetting(SETTINGS_KEYS.LANGUAGE, 'French')
      setSetting(SETTINGS_KEYS.GLOBAL_INSTRUCTIONS, 'Global rule')

      const result = await getAllInstructions(testDir, project.id)

      const content = result.content
      expect(content.indexOf('## LANGUAGE')).toBeLessThan(content.indexOf('## GLOBAL INSTRUCTIONS'))
      expect(content).toContain('## LANGUAGE\n\nAlways respond to the user in French.')
    })

    it('omits the LANGUAGE section when language is automatic', async () => {
      const project = createProject('OpenFox', testDir)
      setSetting(SETTINGS_KEYS.LANGUAGE, 'automatic')
      setSetting(SETTINGS_KEYS.GLOBAL_INSTRUCTIONS, 'Global rule')

      const result = await getAllInstructions(testDir, project.id)

      expect(result.content).not.toContain('## LANGUAGE')
      expect(result.content).toContain('## GLOBAL INSTRUCTIONS\n\nGlobal rule')
    })

    it('omits the LANGUAGE section when language is not set', async () => {
      const project = createProject('OpenFox', testDir)
      const result = await getAllInstructions(testDir, project.id)

      expect(result.content).not.toContain('## LANGUAGE')
    })

    it('keeps file entries even when a discovered instruction file becomes unreadable', async () => {
      const project = createProject('OpenFox', testDir)
      const path = join(testDir, 'AGENTS.md')
      await writeFile(path, '# Local instructions')
      await rm(path)

      const result = await getAllInstructions(testDir, project.id)

      expect(result.content).toBe('')
      expect(result.files).toEqual([])
    })
  })

  describe('findProjectInstructionsDirectory', () => {
    it('returns an empty array when .openfox/instructions/ does not exist', async () => {
      const files = await findProjectInstructionsDirectory(testDir)
      expect(files).toEqual([])
    })

    it('returns .md files sorted, ignoring non-.md files and subdirectories', async () => {
      const dir = join(testDir, '.openfox', 'instructions')
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, 'zeta.md'), 'Zeta content')
      await writeFile(join(dir, 'alpha.md'), 'Alpha content')
      await writeFile(join(dir, 'notes.txt'), 'ignored')
      await mkdir(join(dir, 'assets'), { recursive: true })

      const files = await findProjectInstructionsDirectory(testDir)

      expect(files).toEqual([
        { path: join(dir, 'alpha.md'), source: 'directory' },
        { path: join(dir, 'zeta.md'), source: 'directory' },
      ])
    })
  })

  describe('getAllInstructions with .openfox/instructions/', () => {
    it('includes .openfox/instructions/ files in the FILE INSTRUCTIONS section', async () => {
      const project = createProject('OpenFox', testDir)
      const dir = join(testDir, '.openfox', 'instructions')
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, 'style.md'), 'Follow the style guide')

      const result = await getAllInstructions(testDir, project.id)

      expect(result.content).toContain('## FILE INSTRUCTIONS')
      expect(result.content).toContain('Follow the style guide')
      expect(result.files.some((f) => f.source === 'directory' && f.content === 'Follow the style guide')).toBe(true)
    })

    it('combines AGENTS.md and .openfox/instructions/ files in the same section', async () => {
      const project = createProject('OpenFox', testDir)
      await writeFile(join(testDir, 'AGENTS.md'), '# Agent rules')
      const dir = join(testDir, '.openfox', 'instructions')
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, 'extra.md'), 'Extra rules')

      const result = await getAllInstructions(testDir, project.id)

      expect(result.content).toContain('# Agent rules')
      expect(result.content).toContain('Extra rules')
      expect(result.files.map((f) => f.source)).toEqual(['agents-md', 'directory'])
    })
  })

  describe('importInstructionsFromDirectory', () => {
    let sourceDir: string

    beforeEach(async () => {
      sourceDir = join(
        tmpdir(),
        `openfox-instructions-import-source-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      )
      await mkdir(sourceDir, { recursive: true })
    })

    afterEach(async () => {
      await rm(sourceDir, { recursive: true, force: true })
    })

    it('imports .md files into .openfox/instructions/', async () => {
      await writeFile(join(sourceDir, 'foo.md'), 'Foo content')
      await writeFile(join(sourceDir, 'bar.md'), 'Bar content')

      const result = await importInstructionsFromDirectory(sourceDir, testDir)

      expect(result.imported.sort()).toEqual(['bar.md', 'foo.md'])
      expect(result.skipped).toEqual([])

      const files = await findProjectInstructionsDirectory(testDir)
      expect(files.map((f) => f.path.split('/').pop())).toEqual(['bar.md', 'foo.md'])
    })

    it('reports non-.md files as skipped instead of importing them', async () => {
      await writeFile(join(sourceDir, 'notes.md'), 'Notes')
      await writeFile(join(sourceDir, 'image.png'), 'not markdown')

      const result = await importInstructionsFromDirectory(sourceDir, testDir)

      expect(result.imported).toEqual(['notes.md'])
      expect(result.skipped).toEqual([{ name: 'image.png', reason: 'Not a .md file' }])
    })

    it('skips (does not overwrite) a file that already exists in the project', async () => {
      const dir = join(testDir, '.openfox', 'instructions')
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, 'existing.md'), 'Original content')
      await writeFile(join(sourceDir, 'existing.md'), 'Imported content')

      const result = await importInstructionsFromDirectory(sourceDir, testDir)

      expect(result.imported).toEqual([])
      expect(result.skipped).toEqual([
        { name: 'existing.md', reason: 'A file with this name already exists in the project' },
      ])

      const content = await readFile(join(dir, 'existing.md'), 'utf-8')
      expect(content).toBe('Original content')
    })

    it('throws a clear error when the source directory does not exist', async () => {
      await expect(importInstructionsFromDirectory(join(testDir, 'does-not-exist'), testDir)).rejects.toThrow(
        'Cannot read directory',
      )
    })
  })
})
