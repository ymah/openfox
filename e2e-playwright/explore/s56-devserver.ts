import { api, devProjectOnRepo, note, report } from './lib.js'
const { dir } = await devProjectOnRepo('devsrv')
const q = `?workdir=${encodeURIComponent(dir)}`
const ds = (path: string, method = 'POST', json?: unknown) =>
  api(`/api/dev-server${path}${q}`, { method, ...(json !== undefined ? { json } : {}) })
const state = async () => (await ds('', 'GET')).body as any
const waitState = async (pred: (s: any) => boolean, ms = 8000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const s = await state()
    if (pred(s)) return s
    await new Promise((r) => setTimeout(r, 300))
  }
  return state()
}
console.log('config bad:', (await ds('/config', 'POST', { command: 5, url: [] })).status)
console.log('config missing:', (await ds('/config', 'POST', {})).status)
// 1. command that exits immediately
await ds('/config', 'POST', { command: 'exit 3', url: 'http://localhost:9' })
console.log('start crashing ->', (await ds('/start')).status)
let s = await waitState((x) => x.state !== 'off' && x.state !== 'running')
console.log('state after crash:', s.state, s.errorMessage?.slice(0, 80))
if (s.state === 'running') note('dev server reported running after its command exited with 3')
await ds('/stop')
// 2. long running with output
await ds('/config', 'POST', { command: 'echo hello-log; sleep 300', url: 'http://localhost:9' })
console.log('start long ->', (await ds('/start')).status)
s = await waitState((x) => x.state === 'running' || x.state === 'warning')
console.log('state running:', s.state)
await new Promise((r) => setTimeout(r, 1500))
const logs = (await ds('/logs', 'GET')).body as any
console.log('logs contain output:', JSON.stringify(logs).includes('hello-log'))
if (!JSON.stringify(logs).includes('hello-log')) note('dev server logs missing the command output')
console.log('double start ->', (await ds('/start')).status)
console.log('restart ->', (await ds('/restart')).status)
await ds('/insert-marker', 'POST', { label: 'm' })
console.log('clear logs', (await ds('/clear-logs')).status)
console.log('stop ->', (await ds('/stop')).status)
s = await waitState((x) => x.state === 'off')
console.log('state after stop:', s.state)
if (s.state !== 'off') note(`dev server not off after stop: ${s.state}`)
// leftover process?
const { execSync } = await import('node:child_process')
const left = execSync(`pgrep -f "sleep 300" || true`, { encoding: 'utf-8' }).trim()
console.log('leftover sleep processes:', left || 'none')
if (left) {
  note('process left running after dev-server stop')
  execSync('pkill -f "sleep 300" || true')
}
// 3. no config
const { dir: dir2 } = await devProjectOnRepo('devsrv2')
const r = await api(`/api/dev-server/start?workdir=${encodeURIComponent(dir2)}`, { method: 'POST' })
console.log('start without config ->', r.status, JSON.stringify(r.body).slice(0, 100))
if (r.status >= 500) note('start without config answers 5xx instead of 4xx')
report()
