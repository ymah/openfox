// Run through the driver below: kills and restarts the explore server mid-turn.
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startFakeLlm } from './fake-llm.js'

const dir = mkdtempSync(join(tmpdir(), 'openfox-restart-'))
const env = {
  ...process.env,
  EXPLORE_DIR: dir,
  OPENFOX_DB_PATH: join(dir, 'db.sqlite'),
  OPENFOX_MOCK_LLM: 'false',
  EXPLORE_PORT: '10771',
}
const base = 'http://127.0.0.1:10771'
let child = spawn('npx', ['tsx', 'e2e-playwright/explore/server.ts'], { env, stdio: 'ignore', detached: true })
const alive = async () => {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return true
    } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}
const api = async (path: string, init?: RequestInit & { json?: unknown }) => {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json' },
    ...(init?.json !== undefined ? { body: JSON.stringify(init.json), method: init.method ?? 'POST' } : {}),
  })
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any }
}
const kill = () => {
  try {
    process.kill(-child.pid!, 'SIGKILL')
  } catch {}
  try {
    execSync('pkill -9 -f "EXPLORE_PORT" || true')
  } catch {}
}
const findings: string[] = []
const fake = startFakeLlm(18999)
console.log('boot 1', await alive())
const p = await api('/api/providers', {
  json: { name: 'fake', url: 'http://127.0.0.1:18999/hang', backend: 'vllm', model: 'fake-model' },
})
const pid = p.body.provider?.id ?? p.body.id
const cfg = (await api('/api/config')).body
const proj = (await api('/api/projects', { json: { name: 'restart', workdir: `${cfg.workdir}/restart` } })).body.project
  .id
const sid = (await api('/api/sessions', { json: { projectId: proj, title: 'restart' } })).body.session.id
await api(`/api/sessions/${sid}/provider`, { json: { providerId: pid, model: 'fake-model' } })
await api(`/api/sessions/${sid}/message`, { json: { content: 'first message' } })
await new Promise((r) => setTimeout(r, 2500))
console.log('running before kill:', (await api(`/api/sessions/${sid}`)).body.session.isRunning)
// kill hard in the middle of the turn
try {
  process.kill(-child.pid!, 'SIGKILL')
} catch {}
execSync(`pkill -9 -f "tsx.*explore/server" || true`)
await new Promise((r) => setTimeout(r, 1500))
child = spawn('npx', ['tsx', 'e2e-playwright/explore/server.ts'], { env, stdio: 'ignore', detached: true })
console.log('boot 2', await alive())
const after = (await api(`/api/sessions/${sid}`)).body
console.log(
  'after restart: found',
  after.session?.id === sid,
  'isRunning',
  after.session?.isRunning,
  'messages',
  after.messages?.length,
)
if (!after.session) findings.push('session lost across restart')
if (after.session?.isRunning) findings.push('session still flagged running after a restart (nothing is running)')
const msgs = (after.messages ?? []).filter((m: any) => m.role === 'user').map((m: any) => m.content)
if (!msgs.includes('first message')) findings.push('user message lost across restart')
// can the session be used again?
await api(`/api/sessions/${sid}/provider`, { method: 'DELETE' })
const again = await api(`/api/sessions/${sid}/message`, { json: { content: 'second message' } })
console.log('send after restart', again.status)
await new Promise((r) => setTimeout(r, 3000))
const st = (await api(`/api/sessions/${sid}`)).body
console.log('state after second message: running', st.session.isRunning, 'msgs', st.messages.length)
const stop = await api(`/api/sessions/${sid}/stop`, { method: 'POST' })
console.log('stop', stop.status)
console.log('listing ok', (await api(`/api/sessions?projectId=${proj}`)).status)
console.log(findings.length ? 'FINDINGS:\n- ' + findings.join('\n- ') : 'findings: none')
try {
  process.kill(-child.pid!, 'SIGKILL')
} catch {}
fake.close()
process.exit(0)
