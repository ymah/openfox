import { execSync } from 'node:child_process'
import WebSocket from 'ws'
import { BASE, api, ensureProjects } from './lib.js'

const fx = await ensureProjects()
const sid = (
  (await api('/api/sessions', { json: { projectId: fx.dev, title: 'wsfuzz' } })).body as { session: { id: string } }
).session.id
const types = [
  ...new Set(
    execSync(
      `grep -rhoE "case '[a-z]+\\.[A-Za-z_.-]+'|type === '[a-z]+\\.[A-Za-z_.-]+'" src/server/ws src/server/chat --include='*.ts' | grep -v test || true`,
      { encoding: 'utf-8' },
    )
      .split('\n')
      .map((l) => l.match(/'([^']+)'/)?.[1])
      .filter((t): t is string => !!t),
  ),
].filter(
  (t) =>
    !/^(chat\.(delta|done|error|message|stats|tool)|session\.(state|list|created|deleted|running)|project\.(state|list|deleted))/.test(
      t,
    ),
)
console.log('client types:', types.length, types.join(' '))
const payloads: unknown[] = [undefined, null, 5, 'x', [], {}, { sessionId: 5, content: {}, path: [], id: null }]
const logs = (await import('node:fs')).readFileSync('/tmp/explore-server.log', 'utf-8').length

const ws = new WebSocket(BASE.replace('http', 'ws'))
await new Promise((r, j) => {
  ws.on('open', r)
  ws.on('error', j)
})
let closed = false
ws.on('close', () => (closed = true))
const send = (s: string) => ws.send(s)
for (const raw of ['not json', '{}', '[]', 'null', '{"type":5}', '{"type":"nope.nope"}', '"x"']) send(raw)
for (const t of types)
  for (const p of payloads) {
    send(
      JSON.stringify({
        type: t,
        ...(p !== undefined ? { payload: p } : {}),
        id: 'f',
        sessionId: typeof p === 'object' && p ? sid : p,
      }),
    )
  }
await new Promise((r) => setTimeout(r, 4000))
console.log('socket still open:', !closed)
const h = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(5000) })
  .then((r) => r.status)
  .catch(() => 'DOWN')
console.log('health:', h)
const log = (await import('node:fs')).readFileSync('/tmp/explore-server.log', 'utf-8').slice(logs)
const errs = log.split('\n').filter((l) => /uncaught|unhandled|TypeError|ReferenceError|Cannot read/i.test(l))
console.log('server log errors:', errs.length)
for (const e of [...new Set(errs)].slice(0, 15)) console.log('  ', e.slice(0, 220))
ws.close()
process.exit(0)
