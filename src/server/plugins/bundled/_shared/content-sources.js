// Shared helpers for the bundled first-party plugins (openfox-gtd,
// openfox-writing). They turn a plugin's own on-disk content — *.agent.md,
// *.workflow.json, skill/SKILL.md — into the shapes the plugin registry
// expects, so each plugin's entry point stays a declaration.
//
// This directory has no package.json on purpose: plugin discovery only picks up
// directories that have one, so `_shared` is skipped as a plugin and is only
// ever imported by its siblings.
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import matter from 'gray-matter'

async function listFiles(dir, suffix) {
  try {
    return (await readdir(dir)).filter((f) => f.endsWith(suffix)).sort()
  } catch {
    return [] // directory absent — contribute nothing rather than failing the plugin
  }
}

/**
 * Agents from a directory of `*.agent.md` files. Mirrors the core's
 * parseAgentFile (src/server/agents/registry.ts) so a definition behaves
 * identically whether it ships in the core or in a plugin.
 */
export function agentSource(id, label, dir) {
  return {
    id,
    label,
    load: async () => {
      const agents = []
      for (const file of await listFiles(dir, '.agent.md')) {
        const { data, content } = matter(await readFile(join(dir, file), 'utf-8'))
        const prompt = content.trim()
        if (!data.id || !prompt) continue
        agents.push({
          id: String(data.id),
          name: String(data.name ?? data.id),
          description: String(data.description ?? ''),
          prompt,
          subagent: data.subagent === true,
          allowedTools: Array.isArray(data.allowedTools) ? data.allowedTools.map(String) : [],
          ...(typeof data.color === 'string' ? { color: data.color } : {}),
          ...(typeof data.category === 'string' ? { category: data.category } : {}),
          ...(Array.isArray(data.results) ? { results: data.results.map(String) } : {}),
        })
      }
      return agents
    },
  }
}

/** Workflows from a directory of `*.workflow.json` files. */
export function workflowSource(id, label, dir) {
  return {
    id,
    label,
    load: async () => {
      const workflows = []
      for (const file of await listFiles(dir, '.workflow.json')) {
        workflows.push(JSON.parse(await readFile(join(dir, file), 'utf-8')))
      }
      return workflows
    },
  }
}

/**
 * A single skill from `<dir>/SKILL.md`. The frontmatter uses `name` as the id,
 * matching the portable SKILL.md convention the core's loader reads.
 */
export function skillSource(id, label, dir) {
  return {
    id,
    label,
    load: async () => {
      let raw
      try {
        raw = await readFile(join(dir, 'SKILL.md'), 'utf-8')
      } catch {
        return []
      }
      const { data, content } = matter(raw)
      const prompt = content.trim()
      if (!data.name || !prompt) return []
      return [
        {
          id: String(data.name),
          name: String(data.name),
          description: String(data.description ?? ''),
          prompt,
        },
      ]
    },
  }
}
