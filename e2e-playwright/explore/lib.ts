import { chromium, type Browser, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { attachWatchers } from './probe.js'

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

export async function launch(
  label: string,
  viewport = { width: 1400, height: 900 },
): Promise<{ browser: Browser; page: Page }> {
  const browser = await chromium.launch()
  const page = await (await browser.newContext({ viewport })).newPage()
  attachWatchers(page, label)
  return { browser, page }
}

export const findings: string[] = []
export function note(msg: string): void {
  findings.push(msg)
  console.log('FINDING:', msg)
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
