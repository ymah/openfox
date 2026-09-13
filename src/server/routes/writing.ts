import { type Router, type Request, type Response } from 'express'
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, resolve, dirname, sep } from 'node:path'
import matter from 'gray-matter'
import { getProject } from '../db/projects.js'
import { serverT } from '../i18n.js'

const CODEX_TYPES = ['characters', 'locations', 'lore', 'items', 'subplots'] as const
type CodexType = (typeof CODEX_TYPES)[number]

function isCodexType(value: string): value is CodexType {
  return (CODEX_TYPES as readonly string[]).includes(value)
}

interface CodexEntry {
  type: CodexType
  slug: string
  title: string
  tags: string[]
  facts: Record<string, unknown>
  body: string
}

interface SceneFile {
  slug: string
  path: string // relative to the vault root, e.g. manuscript/01-.../01-.../02-x.md
  title?: string
  pov?: string
  status?: string
  summary?: string
}

/**
 * Codex slugs are file names: lowercase kebab-case only (no separators, no
 * dots). Unicode letters are allowed so non-Latin titles keep a readable slug.
 */
const SLUG_PATTERN = /^[\p{Ll}\p{N}][\p{Ll}\p{N}-]*$/u

/** Scene paths live under manuscript/ and are markdown files — never AGENTS.md, .git/, codex/… */
function isManuscriptScenePath(relPath: string): boolean {
  if (!relPath.startsWith('manuscript/') || !relPath.endsWith('.md')) return false
  const segments = relPath.split('/')
  return segments.every((seg) => seg.length > 0 && seg !== '.' && seg !== '..')
}

/** Singular frontmatter `type` (skill contract) for a codex directory name. */
const CODEX_TYPE_LABEL: Record<CodexType, string> = {
  characters: 'character',
  locations: 'location',
  lore: 'lore',
  items: 'item',
  subplots: 'subplot',
}

/** Resolve a vault-relative path under the project's workdir, rejecting any escape attempt. */
function resolveVaultPath(workdir: string, relativePath: string): string | null {
  const base = resolve(workdir)
  const resolved = resolve(base, relativePath)
  if (resolved !== base && !resolved.startsWith(base + sep)) return null
  return resolved
}

function slugTitle(slug: string): string {
  return slug.replace(/^\d+-/, '').replace(/-/g, ' ')
}

async function readCodexEntry(absPath: string, type: CodexType, slug: string): Promise<CodexEntry> {
  const raw = await readFile(absPath, 'utf-8')
  // gray-matter caches every distinct input string forever unless options are
  // passed; each autosave would pin a full copy of the text in memory.
  const parsed = matter(raw, {})
  const data = { ...(parsed.data as Record<string, unknown>) }
  return {
    type,
    slug,
    title: typeof data['title'] === 'string' ? data['title'] : slugTitle(slug),
    tags: Array.isArray(data['tags']) ? (data['tags'] as string[]) : [],
    facts:
      typeof data['facts'] === 'object' && data['facts'] !== null ? (data['facts'] as Record<string, unknown>) : {},
    body: parsed.content.trim(),
  }
}

export function registerWritingRoutes(router: Router): void {
  const requireProject = (req: Request, res: Response): { id: string; workdir: string } | null => {
    const projectId = req.params['projectId'] as string
    const project = getProject(projectId)
    if (!project) {
      res.status(404).json({ error: serverT({ en: 'Project not found', fr: 'Projet introuvable' }) })
      return null
    }
    return { id: project.id, workdir: project.workdir }
  }

  /** Resolve the project and its codex entry's path for :type/:slug, writing the error response itself on failure. */
  const requireCodexPath = (req: Request, res: Response): { type: CodexType; slug: string; absPath: string } | null => {
    const project = requireProject(req, res)
    if (!project) return null
    const { type, slug } = req.params as { type: string; slug: string }
    if (!isCodexType(type)) {
      res.status(400).json({ error: serverT({ en: 'Unknown codex type', fr: 'Type de codex inconnu' }) })
      return null
    }
    // Express decodes %2F, so an unvalidated slug could write codex/characters/a/b.md
    if (!SLUG_PATTERN.test(slug)) {
      res.status(400).json({ error: serverT({ en: 'Invalid slug', fr: 'Slug invalide' }) })
      return null
    }
    const absPath = resolveVaultPath(project.workdir, join('codex', type, `${slug}.md`))
    if (!absPath) {
      res.status(400).json({ error: serverT({ en: 'Invalid path', fr: 'Chemin invalide' }) })
      return null
    }
    return { type, slug, absPath }
  }

  /** Resolve the project and its `?path=` scene, writing the error response itself on failure. */
  const requireScenePath = (req: Request, res: Response): { relPath: string; absPath: string } | null => {
    const project = requireProject(req, res)
    if (!project) return null
    const relPath = req.query['path'] as string
    if (!relPath) {
      res.status(400).json({ error: serverT({ en: 'path required', fr: 'path requis' }) })
      return null
    }
    // Scope to manuscript/*.md: the workdir-escape guard alone still allowed
    // reading and rewriting .git/config, AGENTS.md, .env or codex entries.
    if (!isManuscriptScenePath(relPath)) {
      res.status(400).json({ error: serverT({ en: 'Invalid scene path', fr: 'Chemin de scène invalide' }) })
      return null
    }
    const absPath = resolveVaultPath(project.workdir, relPath)
    if (!absPath) {
      res.status(400).json({ error: serverT({ en: 'Invalid path', fr: 'Chemin invalide' }) })
      return null
    }
    return { relPath, absPath }
  }

  // ------------------------------------------------------------------
  // Codex
  // ------------------------------------------------------------------

  router.get('/projects/:projectId/codex', async (req: Request, res: Response) => {
    const project = requireProject(req, res)
    if (!project) return

    const entries: CodexEntry[] = []
    for (const type of CODEX_TYPES) {
      const dirPath = resolveVaultPath(project.workdir, join('codex', type))
      if (!dirPath) continue
      let files: string[]
      try {
        files = (await readdir(dirPath)).filter((f) => f.endsWith('.md'))
      } catch {
        continue // codex/<type>/ doesn't exist yet — no entries of this type
      }
      for (const file of files) {
        const slug = file.slice(0, -3)
        try {
          entries.push(await readCodexEntry(join(dirPath, file), type, slug))
        } catch {
          // skip unreadable/malformed entries rather than failing the whole list
        }
      }
    }
    res.json({ entries })
  })

  router.get('/projects/:projectId/codex/:type/:slug', async (req: Request, res: Response) => {
    const codexPath = requireCodexPath(req, res)
    if (!codexPath) return
    const { type, slug, absPath } = codexPath
    try {
      res.json(await readCodexEntry(absPath, type, slug))
    } catch {
      res.status(404).json({ error: serverT({ en: 'Entry not found', fr: 'Entrée introuvable' }) })
    }
  })

  router.put('/projects/:projectId/codex/:type/:slug', async (req: Request, res: Response) => {
    const codexPath = requireCodexPath(req, res)
    if (!codexPath) return
    const { type, slug, absPath } = codexPath

    const body = req.body as { title?: string; tags?: string[]; facts?: Record<string, unknown>; body?: string }
    const content = matter.stringify(body.body ?? '', {
      id: slug,
      type: CODEX_TYPE_LABEL[type],
      title: body.title ?? slugTitle(slug),
      tags: body.tags ?? [],
      facts: body.facts ?? {},
    })
    await mkdir(dirname(absPath), { recursive: true })
    await writeFile(absPath, content, 'utf-8')
    res.json(await readCodexEntry(absPath, type, slug))
  })

  // ------------------------------------------------------------------
  // Manuscript
  // ------------------------------------------------------------------

  router.get('/projects/:projectId/manuscript', async (req: Request, res: Response) => {
    const project = requireProject(req, res)
    if (!project) return

    const manuscriptDir = resolveVaultPath(project.workdir, 'manuscript')
    if (!manuscriptDir) return res.status(400).json({ error: serverT({ en: 'Invalid path', fr: 'Chemin invalide' }) })

    const acts: { slug: string; title: string; chapters: unknown[] }[] = []
    let actDirs: string[]
    try {
      actDirs = (await readdir(manuscriptDir, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()
    } catch {
      return res.json({ acts: [] }) // manuscript/ doesn't exist yet
    }

    for (const actSlug of actDirs) {
      const actDir = join(manuscriptDir, actSlug)
      let chapterDirs: string[]
      try {
        chapterDirs = (await readdir(actDir, { withFileTypes: true }))
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
          .sort()
      } catch {
        continue // act folder vanished/unreadable between listing and reading — skip it, not the whole manuscript
      }

      const chapters = []
      for (const chapterSlug of chapterDirs) {
        const chapterDir = join(actDir, chapterSlug)
        let sceneFiles: string[]
        try {
          sceneFiles = (await readdir(chapterDir)).filter((f) => f.endsWith('.md')).sort()
        } catch {
          continue // same — skip this chapter rather than failing the whole request
        }

        const scenes: SceneFile[] = []
        for (const file of sceneFiles) {
          const slug = file.slice(0, -3)
          const relPath = `manuscript/${actSlug}/${chapterSlug}/${file}`
          try {
            const raw = await readFile(join(chapterDir, file), 'utf-8')
            const data = matter(raw, {}).data as Record<string, unknown>
            scenes.push({
              slug,
              path: relPath,
              ...(typeof data['title'] === 'string' ? { title: data['title'] } : {}),
              ...(typeof data['pov'] === 'string' ? { pov: data['pov'] } : {}),
              ...(typeof data['status'] === 'string' ? { status: data['status'] } : {}),
              ...(typeof data['summary'] === 'string' ? { summary: data['summary'] } : {}),
            })
          } catch {
            scenes.push({ slug, path: relPath })
          }
        }
        chapters.push({ slug: chapterSlug, title: slugTitle(chapterSlug), scenes })
      }
      acts.push({ slug: actSlug, title: slugTitle(actSlug), chapters })
    }

    res.json({ acts })
  })

  router.get('/projects/:projectId/manuscript/scene', async (req: Request, res: Response) => {
    const scenePath = requireScenePath(req, res)
    if (!scenePath) return
    const { relPath, absPath } = scenePath
    try {
      const raw = await readFile(absPath, 'utf-8')
      const parsed = matter(raw, {})
      res.json({ path: relPath, frontmatter: { ...parsed.data }, body: parsed.content.replace(/^\n/, '') })
    } catch {
      res.status(404).json({ error: serverT({ en: 'Scene not found', fr: 'Scène introuvable' }) })
    }
  })

  router.put('/projects/:projectId/manuscript/scene', async (req: Request, res: Response) => {
    const scenePath = requireScenePath(req, res)
    if (!scenePath) return
    const { relPath, absPath } = scenePath

    const body = req.body as { frontmatter?: Record<string, unknown>; body?: string }
    let existingFrontmatter: Record<string, unknown> = {}
    try {
      existingFrontmatter = { ...(matter(await readFile(absPath, 'utf-8'), {}).data as Record<string, unknown>) }
    } catch {
      // new scene file
    }
    const sceneSlug = relPath.slice(relPath.lastIndexOf('/') + 1, -3)
    // `id` = file slug, as the writing skill documents for agent-authored scenes
    const frontmatter = { id: sceneSlug, ...existingFrontmatter, ...(body.frontmatter ?? {}) }
    const content = matter.stringify(body.body ?? '', frontmatter)
    await mkdir(dirname(absPath), { recursive: true })
    await writeFile(absPath, content, 'utf-8')
    res.json({ path: relPath, frontmatter, body: body.body ?? '' })
  })
}
