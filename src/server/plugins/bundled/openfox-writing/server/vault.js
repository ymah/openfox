// The novel-writing vault: the Codex and manuscript file operations that used to
// be REST routes in the core (src/server/routes/writing.ts). They are RPC methods
// now, so the whole function ships in this plugin.
//
// The path guards below are the only thing standing between a scene path and the
// rest of the user's disk, so they are kept exactly as they were: scope to
// manuscript/**/*.md, reject traversal, and confine every resolved path to the
// project's workdir. The workdir itself is resolved server-side by the RPC route
// from the projectId — never taken from the caller.
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, resolve, dirname, sep } from 'node:path'
import matter from 'gray-matter'

const CODEX_TYPES = ['characters', 'locations', 'lore', 'items', 'subplots']

/** Singular frontmatter `type` (skill contract) for a codex directory name. */
const CODEX_TYPE_LABEL = {
  characters: 'character',
  locations: 'location',
  lore: 'lore',
  items: 'item',
  subplots: 'subplot',
}

/**
 * Codex slugs are file names: lowercase kebab-case only (no separators, no
 * dots). Unicode letters are allowed so non-Latin titles keep a readable slug.
 */
const SLUG_PATTERN = /^[\p{Ll}\p{N}][\p{Ll}\p{N}-]*$/u

/** Scene paths live under manuscript/ and are markdown files — never AGENTS.md, .git/, codex/… */
function isManuscriptScenePath(relPath) {
  if (!relPath.startsWith('manuscript/') || !relPath.endsWith('.md')) return false
  return relPath.split('/').every((seg) => seg.length > 0 && seg !== '.' && seg !== '..')
}

/** Resolve a vault-relative path under the project's workdir, rejecting any escape attempt. */
function resolveVaultPath(workdir, relativePath) {
  const base = resolve(workdir)
  const resolved = resolve(base, relativePath)
  if (resolved !== base && !resolved.startsWith(base + sep)) return null
  return resolved
}

/**
 * The RPC transport turns any throw into a 400, so the distinction the REST
 * routes made with status codes is carried in `code` instead and the views read
 * it to tell "not found" from "invalid request".
 */
class VaultError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

const notFound = (what) => new VaultError('not_found', `${what} not found`)
const invalid = (message) => new VaultError('invalid_request', message)

function slugTitle(slug) {
  return slug.replace(/^\d+-/, '').replace(/-/g, ' ')
}

function requireWorkdir(context) {
  if (!context.projectId) throw invalid('projectId is required')
  if (!context.workdir) throw notFound('Project')
  return context.workdir
}

async function readCodexEntry(absPath, type, slug) {
  const raw = await readFile(absPath, 'utf-8')
  // gray-matter caches every distinct input string forever unless options are
  // passed; each autosave would pin a full copy of the text in memory.
  const parsed = matter(raw, {})
  const data = { ...parsed.data }
  return {
    type,
    slug,
    title: typeof data.title === 'string' ? data.title : slugTitle(slug),
    tags: Array.isArray(data.tags) ? data.tags : [],
    facts: typeof data.facts === 'object' && data.facts !== null ? data.facts : {},
    body: parsed.content.trim(),
  }
}

function codexPathFor(workdir, type, slug) {
  if (!CODEX_TYPES.includes(type)) throw invalid('Unknown codex type')
  if (!SLUG_PATTERN.test(String(slug))) throw invalid('Invalid slug')
  const absPath = resolveVaultPath(workdir, join('codex', type, `${slug}.md`))
  if (!absPath) throw invalid('Invalid path')
  return absPath
}

function scenePathFor(workdir, relPath) {
  if (!relPath) throw invalid('path is required')
  if (!isManuscriptScenePath(relPath)) throw invalid('Invalid scene path')
  const absPath = resolveVaultPath(workdir, relPath)
  if (!absPath) throw invalid('Invalid path')
  return absPath
}

export function registerVaultRpc(registry) {
  registry.registerRpc('codex.list', async (_params, context) => {
    const workdir = requireWorkdir(context)
    const entries = []
    for (const type of CODEX_TYPES) {
      const dirPath = resolveVaultPath(workdir, join('codex', type))
      if (!dirPath) continue
      let files
      try {
        files = (await readdir(dirPath)).filter((f) => f.endsWith('.md'))
      } catch {
        continue // codex/<type>/ doesn't exist yet — no entries of this type
      }
      for (const file of files) {
        try {
          entries.push(await readCodexEntry(join(dirPath, file), type, file.slice(0, -3)))
        } catch {
          // skip unreadable/malformed entries rather than failing the whole list
        }
      }
    }
    return { entries }
  })

  registry.registerRpc('codex.get', async (params, context) => {
    const workdir = requireWorkdir(context)
    const absPath = codexPathFor(workdir, params.type, params.slug)
    try {
      return await readCodexEntry(absPath, params.type, params.slug)
    } catch {
      throw notFound('Entry')
    }
  })

  registry.registerRpc('codex.save', async (params, context) => {
    const workdir = requireWorkdir(context)
    const absPath = codexPathFor(workdir, params.type, params.slug)
    const content = matter.stringify(params.body ?? '', {
      id: params.slug,
      type: CODEX_TYPE_LABEL[params.type],
      title: params.title ?? slugTitle(params.slug),
      tags: params.tags ?? [],
      facts: params.facts ?? {},
    })
    await mkdir(dirname(absPath), { recursive: true })
    await writeFile(absPath, content, 'utf-8')
    return readCodexEntry(absPath, params.type, params.slug)
  })

  registry.registerRpc('manuscript.tree', async (_params, context) => {
    const workdir = requireWorkdir(context)
    const manuscriptDir = resolveVaultPath(workdir, 'manuscript')
    if (!manuscriptDir) throw invalid('Invalid path')

    const acts = []
    let actDirs
    try {
      actDirs = (await readdir(manuscriptDir, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()
    } catch {
      return { acts: [] } // manuscript/ doesn't exist yet
    }

    for (const actSlug of actDirs) {
      const actDir = join(manuscriptDir, actSlug)
      let chapterDirs
      try {
        chapterDirs = (await readdir(actDir, { withFileTypes: true }))
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
          .sort()
      } catch {
        continue // act folder vanished between listing and reading — skip it, not the whole manuscript
      }

      const chapters = []
      for (const chapterSlug of chapterDirs) {
        const chapterDir = join(actDir, chapterSlug)
        let sceneFiles
        try {
          sceneFiles = (await readdir(chapterDir)).filter((f) => f.endsWith('.md')).sort()
        } catch {
          continue // same — skip this chapter rather than failing the whole request
        }

        const scenes = []
        for (const file of sceneFiles) {
          const slug = file.slice(0, -3)
          const path = `manuscript/${actSlug}/${chapterSlug}/${file}`
          try {
            const data = matter(await readFile(join(chapterDir, file), 'utf-8'), {}).data
            scenes.push({
              slug,
              path,
              ...(typeof data.title === 'string' ? { title: data.title } : {}),
              ...(typeof data.pov === 'string' ? { pov: data.pov } : {}),
              ...(typeof data.status === 'string' ? { status: data.status } : {}),
              ...(typeof data.summary === 'string' ? { summary: data.summary } : {}),
            })
          } catch {
            scenes.push({ slug, path })
          }
        }
        chapters.push({ slug: chapterSlug, title: slugTitle(chapterSlug), scenes })
      }
      acts.push({ slug: actSlug, title: slugTitle(actSlug), chapters })
    }

    return { acts }
  })

  registry.registerRpc('scene.get', async (params, context) => {
    const workdir = requireWorkdir(context)
    const absPath = scenePathFor(workdir, params.path)
    try {
      const parsed = matter(await readFile(absPath, 'utf-8'), {})
      return { path: params.path, frontmatter: { ...parsed.data }, body: parsed.content.replace(/^\n/, '') }
    } catch {
      throw notFound('Scene')
    }
  })

  registry.registerRpc('scene.save', async (params, context) => {
    const workdir = requireWorkdir(context)
    const relPath = params.path
    const absPath = scenePathFor(workdir, relPath)

    let existingFrontmatter = {}
    try {
      existingFrontmatter = { ...matter(await readFile(absPath, 'utf-8'), {}).data }
    } catch {
      // new scene file
    }
    const sceneSlug = relPath.slice(relPath.lastIndexOf('/') + 1, -3)
    // `id` = file slug, as the writing skill documents for agent-authored scenes
    const frontmatter = { id: sceneSlug, ...existingFrontmatter, ...(params.frontmatter ?? {}) }
    await mkdir(dirname(absPath), { recursive: true })
    await writeFile(absPath, matter.stringify(params.body ?? '', frontmatter), 'utf-8')
    return { path: relPath, frontmatter, body: params.body ?? '' }
  })
}
