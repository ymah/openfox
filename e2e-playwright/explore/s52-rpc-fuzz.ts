import { execSync } from 'node:child_process'
import { api, BASE, ensureProjects } from './lib.js'
const fx = await ensureProjects()
const bad: string[] = []
const plugins: [string, string][] = [
  ['openfox-writing', fx.writing],
  ['openfox-chat', fx.chat],
]
const params: unknown[] = [
  undefined,
  null,
  5,
  'x',
  [],
  {},
  {
    type: [],
    slug: {},
    path: 5,
    id: [],
    query: {},
    text: 5,
    content: {},
    title: [],
    tags: 'x',
    facts: 3,
    body: 7,
    limit: 'a',
    frontmatter: 'x',
  },
]
for (const [plugin, projectId] of plugins) {
  const src = execSync(
    `grep -rhoE "registerRpc\\(\\s*'[^']+'" src/server/plugins/bundled/${plugin} --include='*.js' --include='*.ts' || true`,
    { encoding: 'utf-8' },
  )
  const methods = [...src.matchAll(/'([^']+)'/g)].map((m) => m[1]!)
  console.log(plugin, methods.join(' '))
  for (const method of methods) {
    if (/wipe|clear|delete|forget/i.test(method)) continue
    for (const p of params)
      for (const ctx of [{ projectId }, { projectId: 'nope' }, {}]) {
        try {
          const res = await fetch(`${BASE}/api/plugins/${plugin}/rpc/${method}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...(p !== undefined ? { params: p } : {}), ...ctx }),
            signal: AbortSignal.timeout(8000),
          })
          if (res.status >= 500)
            bad.push(
              `${res.status} ${plugin}/${method} params=${JSON.stringify(p)?.slice(0, 40)} ctx=${JSON.stringify(ctx).slice(0, 30)}`,
            )
          await res.arrayBuffer()
        } catch (e) {
          bad.push(`HANG ${plugin}/${method} ${(e as Error).name}`)
        }
      }
  }
}
console.log(bad.length ? [...new Set(bad)].join('\n') : 'no 5xx / hangs')
console.log('health', (await api('/api/health')).status)
