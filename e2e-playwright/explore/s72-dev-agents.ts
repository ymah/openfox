import { api, ensureProjects, launch, note, report, sendAndWait, BASE, SHOTS } from './lib.js'

const fx = await ensureProjects()
const agents = (await api('/api/agents')).body as {
  defaults: { id: string; category?: string; subagent?: boolean; allowedTools?: string[] }[]
}
const want = [
  'architect',
  'security_reviewer',
  'test_runner',
  'debugger',
  'refactorer',
  'performance_engineer',
  'docs_writer',
]
for (const id of want) {
  const a = agents.defaults.find((x) => x.id === id)
  console.log(id.padEnd(22), a ? `category=${a.category} subagent=${a.subagent}` : 'MISSING')
  if (!a) note(`agent ${id} missing from /api/agents`)
}
const wfs = (await api('/api/workflows')).body as {
  workflows?: { id: string; name: string; category?: string }[]
  defaults?: any[]
}
const list = (wfs.workflows ?? wfs.defaults ?? []) as { id: string; name: string; category?: string }[]
const audit = list.find((w) => w.id === 'dev-audit')
console.log('dev-audit workflow:', audit ? `${audit.name} [${audit.category}]` : 'MISSING')
if (!audit) note('dev-audit workflow missing')

// Other project functions must not see the dev agents or workflows in their lists (web scoping uses category).
const { browser, page } = await launch('dev-agents')
page.setDefaultTimeout(10000)
const probeSession = ((await api('/api/sessions', { json: { projectId: fx.dev, title: 'agents ui' } })).body as any)
  .session.id
await page.goto(`${BASE}/p/${fx.dev}/s/${probeSession}`)
await page.waitForLoadState('networkidle')
await page.waitForTimeout(1000)
await page.locator('button[title="Switch agent"]').first().click()
await page.getByText('Manage Agents...').click()
await page.waitForTimeout(1500)
const text = (await page.locator('body').innerText()).replace(/\n+/g, ' | ')
for (const name of [
  'Architect',
  'Security Reviewer',
  'Test Runner',
  'Debugger',
  'Refactorer',
  'Performance Engineer',
  'Docs Writer',
]) {
  const shown = text.includes(name)
  console.log('settings shows', name.padEnd(22), shown)
  if (!shown) note(`Settings → Agents does not show ${name}`)
}
await page.screenshot({ path: `${SHOTS}/72-agents.png` })
await page.keyboard.press('Escape')

// Launch the audit on a dev project: the steps must chain without an execution error.
import WebSocket from 'ws'
import { startFakeLlm } from './fake-llm.js'
const fake = startFakeLlm(18999)
const prov = await api('/api/providers', {
  json: { name: 'fake-agent', url: 'http://127.0.0.1:18999/agent', backend: 'vllm', model: 'fake-model' },
})
const providerId = (prov.body as any).provider?.id ?? (prov.body as any).id
const sid = ((await api('/api/sessions', { json: { projectId: fx.dev, title: 'audit run' } })).body as any).session.id
await api(`/api/sessions/${sid}/provider`, { json: { providerId, model: 'fake-model' } })
const ws = new WebSocket(BASE.replace('http', 'ws'))
await new Promise((r, j) => {
  ws.on('open', r)
  ws.on('error', j)
})
const seen: string[] = []
ws.on('message', (raw) => {
  try {
    const m = JSON.parse(String(raw))
    if (m.type === 'workflow.execution_changed' || m.type === 'chat.error' || m.type === 'phase.changed')
      seen.push(`${m.type}:${JSON.stringify(m.payload).slice(0, 140)}`)
  } catch {}
})
ws.send(JSON.stringify({ type: 'session.load', id: 'l1', payload: { sessionId: sid } }))
await new Promise((r) => setTimeout(r, 800))
ws.send(
  JSON.stringify({
    type: 'runner.launch',
    id: 'r1',
    payload: { sessionId: sid, workflowId: 'dev-audit', params: { scope: 'src' } },
  }),
)
const end = Date.now() + 60000
let running = true
while (Date.now() < end) {
  await new Promise((r) => setTimeout(r, 1000))
  const st = ((await api(`/api/sessions/${sid}`)).body as any).session
  if (st?.isRunning === false && Date.now() > end - 55000) {
    running = false
    break
  }
}
console.log('audit still running after 60s:', running)
console.log(seen.slice(0, 12).join('\n'))
const detail = (await api(`/api/sessions/${sid}`)).body as any
const subAgents = new Set((detail.messages ?? []).map((m: any) => m.subAgentType).filter(Boolean))
console.log('sub-agents seen in the session:', [...subAgents].join(', '))
for (const id of ['architect', 'security_reviewer']) if (!subAgents.has(id)) note(`audit run never called ${id}`)
if (seen.some((s) => s.startsWith('chat.error')))
  note(`audit run raised errors: ${seen.filter((s) => s.startsWith('chat.error'))[0]}`)
ws.close()
fake.close()
report()
await browser.close()
process.exit(0)
