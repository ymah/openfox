import { createServer } from 'node:http'
import { api, note, report } from './lib.js'
const hang = createServer(() => {}).listen(18998, '127.0.0.1')
const cases: [string, Record<string, unknown>][] = [
  ['missing-cmd', { transport: 'stdio', command: '/nonexistent/binary', args: [] }],
  ['no-command', { transport: 'stdio' }],
  ['silent-stdio', { transport: 'stdio', command: 'sleep', args: ['300'], timeout: 3000 }],
  [
    'garbage-stdio',
    { transport: 'stdio', command: 'sh', args: ['-c', 'echo not-json-rpc; echo {; exit 0'], timeout: 3000 },
  ],
  ['crash-stdio', { transport: 'stdio', command: 'sh', args: ['-c', 'exit 7'], timeout: 3000 }],
  ['dead-http', { transport: 'http', url: 'http://127.0.0.1:1/mcp', timeout: 3000 }],
  ['hang-http', { transport: 'http', url: 'http://127.0.0.1:18998/mcp', timeout: 3000 }],
  ['bad-url', { transport: 'http', url: 'not a url' }],
  ['no-url', { transport: 'http' }],
  ['bad-args', { transport: 'stdio', command: 'echo', args: 'x' }],
  ['bad-env', { transport: 'stdio', command: 'echo', args: [], env: 'x' }],
  ['bad-timeout', { transport: 'stdio', command: 'echo', args: [], timeout: 'soon' }],
  ['../traversal', { transport: 'stdio', command: 'echo', args: [], timeout: 3000 }],
  ['x'.repeat(500), { transport: 'stdio', command: 'echo', args: [], timeout: 3000 }],
  ['dup', { transport: 'stdio', command: 'echo', args: [], timeout: 3000 }],
  ['dup', { transport: 'stdio', command: 'echo', args: [], timeout: 3000 }],
]
for (const [name, body] of cases) {
  const t0 = Date.now()
  let status: number | string = '?'
  try {
    const res = await fetch('http://127.0.0.1:10770/api/mcp/servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, ...body }),
      signal: AbortSignal.timeout(25000),
    })
    status = res.status
    await res.arrayBuffer()
  } catch (e) {
    status = (e as Error).name
  }
  const ms = Date.now() - t0
  console.log(name.slice(0, 14).padEnd(15), String(status).padEnd(13), ms + 'ms')
  if (typeof status === 'string' || Number(status) >= 500) note(`mcp add ${name.slice(0, 20)}: ${status}`)
  if (ms > 12000) note(`mcp add ${name.slice(0, 20)} took ${ms}ms`)
}
const list = await api('/api/mcp/servers')
console.log(
  'list',
  list.status,
  ((list.body as any).servers ?? []).map((s: any) => `${s.name.slice(0, 12)}:${s.status ?? s.state}`).join(' '),
)
for (const s of ((list.body as any).servers ?? []) as { name: string }[]) {
  const t0 = Date.now()
  const r = await api(`/api/mcp/servers/${encodeURIComponent(s.name)}`, { method: 'DELETE' })
  if (r.status >= 500 || Date.now() - t0 > 10000)
    note(`mcp delete ${s.name.slice(0, 12)}: ${r.status} ${Date.now() - t0}ms`)
}
console.log('after delete', ((await api('/api/mcp/servers')).body as any).servers?.length)
console.log('health', (await api('/api/health')).status)
report()
hang.close()
process.exit(0)
