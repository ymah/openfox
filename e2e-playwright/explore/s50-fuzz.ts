import { execSync } from 'node:child_process'
import { api, BASE, ensureProjects } from './lib.js'

const fx = await ensureProjects()
const sid = (
  (await api('/api/sessions', { json: { projectId: fx.dev, title: 'fuzz' } })).body as { session: { id: string } }
).session.id
const raw = execSync(
  `grep -rhoE "(app|router)\\.(get|post|put|patch|delete)\\(\\s*'[^']+'" src/server --include='*.ts' | grep -v test || true`,
  { encoding: 'utf-8' },
)
const routes = [
  ...new Set(
    raw
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const m = l.match(/\.(get|post|put|patch|delete)\(\s*'([^']+)'/)!
        return `${m[1]!.toUpperCase()} ${m[2]}`
      }),
  ),
]
const SKIP =
  /shutdown|restart|update|upgrade|terminals|dev-server\/(start|stop)|fix-permissions|deletedAll|\/mcp|workspace-config|DELETE \/api\/projects$|auto-update|logout|login|auth\/|password|import|\*/i
const bodies: (string | undefined)[] = [
  '{}',
  '[]',
  'null',
  '{"id":5,"name":{},"content":[],"path":123,"projectId":{}}',
  '"str"',
]
const fill = (p: string, known: boolean) =>
  p
    .replace(/:projectId|:pid/g, known ? fx.dev : 'nope')
    .replace(/:sessionId|:id|:sid/g, known ? sid : 'nope')
    .replace(/:[A-Za-z]+/g, known ? 'x' : 'nope')

const bad: string[] = []
let n = 0
for (const r of routes) {
  const [method, path] = r.split(' ') as [string, string]
  if (SKIP.test(r)) continue
  for (const known of [true, false]) {
    for (const body of method === 'GET' || method === 'DELETE' ? [undefined] : bodies) {
      n++
      try {
        const res = await fetch(`${BASE}${fill(path, known)}`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          ...(body !== undefined ? { body } : {}),
          signal: AbortSignal.timeout(8000),
        })
        if (res.status >= 500) bad.push(`${res.status} ${method} ${fill(path, known)} body=${body?.slice(0, 40)}`)
        await res.arrayBuffer().catch(() => {})
      } catch (e) {
        bad.push(`HANG/ERR ${method} ${fill(path, known)} body=${body?.slice(0, 40)} ${(e as Error).name}`)
      }
    }
  }
}
console.log(`requests: ${n}, routes: ${routes.length}`)
console.log(bad.length ? `PROBLEMS (${bad.length}):\n` + [...new Set(bad)].join('\n') : 'no 5xx / hangs')
const health = await fetch(`${BASE}/api/health`)
  .then((r) => r.status)
  .catch(() => 'DOWN')
console.log('health after fuzz:', health)
