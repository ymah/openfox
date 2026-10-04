import { chromium, type Browser, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { attachWatchers, findings as watcherFindings } from './probe.js'

export const BASE = process.env['EXPLORE_URL'] ?? 'http://127.0.0.1:10770'
export const SHOTS = '/tmp/explore-shots'
mkdirSync(SHOTS, { recursive: true })

export async function api<T = any>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<{ status: number; body: T }> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...(init?.json !== undefined ? { body: JSON.stringify(init.json), method: init.method ?? 'POST' } : {}),
  })
  return { status: res.status, body: (await res.json().catch(() => ({}))) as T }
}

/** Make the instance usable: one mock provider, so the onboarding wizard does not take over. */
export async function seedProvider(): Promise<void> {
  const cfg = await api('/api/config')
  if ((cfg.body as { providers?: unknown[] }).providers?.length) return
  await api('/api/providers', {
    json: { name: 'Mock', url: 'http://localhost:8000', backend: 'vllm', model: 'mock-model' },
  })
}

/** Requests per route (ids and queries folded), to spot loops like the theme-setting PUT storm. */
const routeCounts = new Map<string, number>()
const RUNAWAY_THRESHOLD = 60

export async function launch(
  label: string,
  viewport = { width: 1400, height: 900 },
): Promise<{ browser: Browser; page: Page }> {
  const browser = await chromium.launch()
  const page = await (await browser.newContext({ viewport })).newPage()
  attachWatchers(page, label)
  page.on('request', (r) => {
    const url = new URL(r.url())
    if (!url.pathname.startsWith('/api/')) return
    const key = `${r.method()} ${url.pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id')}`
    routeCounts.set(key, (routeCounts.get(key) ?? 0) + 1)
  })
  return { browser, page }
}

/** Shared with the page watchers, so console errors and noted findings end up in one list. */
export const findings = watcherFindings
export function note(msg: string): void {
  findings.push(msg)
  console.log('FINDING:', msg)
}

/** Print everything suspicious seen so far, including routes hit suspiciously often. Call at the end. */
export function report(): void {
  for (const [route, count] of routeCounts) {
    if (count > RUNAWAY_THRESHOLD) findings.push(`runaway requests: ${route} x${count}`)
  }
  console.log(findings.length ? `FINDINGS (${findings.length}):\n- ${findings.join('\n- ')}` : 'findings: none')
}

/** A throw-away git repository with one commit, for dev-session scenarios. */
export function makeGitRepo(
  files: Record<string, string> = {
    'README.md': '# Fixture\n',
    'src/math.ts': 'export const add = (a: number, b: number) => a + b\n',
  },
): string {
  const dir = mkdtempSync(join(tmpdir(), 'openfox-explore-repo-'))
  for (const [name, content] of Object.entries(files)) {
    const path = join(dir, name)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
  }
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' })
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'explore@example.invalid')
  git('config', 'user.name', 'Explore')
  git('add', '-A')
  git('commit', '-q', '-m', 'initial')
  return dir
}

/** Create a dev project on a fresh git repo and return its id and folder. */
export async function devProjectOnRepo(name: string): Promise<{ projectId: string; dir: string }> {
  const dir = makeGitRepo()
  const res = await api('/api/projects', { json: { name, workdir: dir } })
  return { projectId: (res.body as { project: { id: string } }).project.id, dir }
}

/** Send a message and wait until the session stops running (or a timeout). */
export async function sendAndWait(sessionId: string, content: string, timeoutMs = 30_000): Promise<void> {
  await api(`/api/sessions/${sessionId}/message`, { json: { content } })
  const deadline = Date.now() + timeoutMs
  await new Promise((r) => setTimeout(r, 600))
  while (Date.now() < deadline) {
    const d = (await api(`/api/sessions/${sessionId}`)).body as { session?: { isRunning?: boolean } }
    if (d.session?.isRunning === false) return
    await new Promise((r) => setTimeout(r, 300))
  }
}

export interface Fixtures {
  dev: string
  chat: string
  gtd: string
  writing: string
}

/** One project of each function (REST, idempotent by name), for scenarios that need them. */
export async function ensureProjects(): Promise<Fixtures> {
  await seedProvider()
  const cfg = (await api('/api/config')).body as { workdir: string }
  const existing = ((await api('/api/projects')).body as { projects: { id: string; name: string }[] }).projects
  const out: Record<string, string> = {}
  for (const type of ['dev', 'chat', 'gtd', 'writing']) {
    const name = `fx-${type}`
    const found = existing.find((p) => p.name === name)
    if (found) {
      out[type] = found.id
      continue
    }
    const res = await api('/api/projects', {
      json: { name, workdir: `${cfg.workdir}/${name}`, ...(type === 'dev' ? {} : { type }) },
    })
    out[type] = (res.body as { project: { id: string } }).project.id
  }
  return out as unknown as Fixtures
}
