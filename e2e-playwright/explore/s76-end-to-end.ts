import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import WebSocket from 'ws'
import { api, BASE, launch, makeGitRepo, note, report, SHOTS } from './lib.js'
import { startScenarioLlm } from './scenario-llm.js'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const dir = makeGitRepo({
  'README.md': '# Users service\n',
  'package.json': '{ "name": "users", "type": "module" }\n',
  'src/db.js': 'export const db = { query: (sql, params) => [] }\n',
  'src/errors.js': 'export function handle(err, res) {\n  res.status(500)\n  res.send(err.stack)\n}\n',
})
const { server, steps } = startScenarioLlm(18997)
const prov = await api('/api/providers', {
  json: { name: 'scenario', url: 'http://127.0.0.1:18997', backend: 'vllm', model: 'scenario-model' },
})
const providerId = ((prov.body as any).provider?.id ?? (prov.body as any).id) as string
const projectId = ((await api('/api/projects', { json: { name: 'users-service', workdir: dir } })).body as any).project
  .id
const sid = ((await api('/api/sessions', { json: { projectId, title: 'Add /users search' } })).body as any).session.id
await api(`/api/sessions/${sid}/provider`, { json: { providerId, model: 'scenario-model' } })

const board = async () => ((await api(`/api/projects/${projectId}/tasks?status=all`)).body as any).tasks as any[]
const label = (t: any) => `${String(t.prompt).split('\n')[0]} [${t.status}]`
const idle = async (ms = 120000) => {
  await sleep(1500)
  const end = Date.now() + ms
  while (Date.now() < end) {
    const s = ((await api(`/api/sessions/${sid}`)).body as any).session
    if (s?.isRunning === false) return true
    await sleep(700)
  }
  return false
}

const ws = new WebSocket(BASE.replace('http', 'ws'))
await new Promise((r, j) => {
  ws.on('open', r)
  ws.on('error', j)
})
const stepOrder: string[] = []
let status = ''
ws.on('message', (raw) => {
  try {
    const m = JSON.parse(String(raw))
    if (m.type === 'workflow.execution_changed') {
      const p = m.payload as { currentStepId?: string; status?: string; workflowId?: string }
      const key = `${p.workflowId}:${p.currentStepId}`
      if (p.currentStepId && stepOrder[stepOrder.length - 1] !== key) stepOrder.push(key)
      if (p.status) status = `${p.workflowId}=${p.status}`
    }
  } catch {}
})
const send = (type: string, payload: unknown) => ws.send(JSON.stringify({ type, id: type, payload }))
send('session.load', { sessionId: sid })
await sleep(800)

console.log('\n=== 1. The user asks the Planner (and mentions something for later)')
await api(`/api/sessions/${sid}/message`, {
  json: {
    content:
      'Add a /users search endpoint with a q parameter. Also note for later that the results will need pagination.',
  },
})
if (!(await idle(60000))) note('the planner turn did not finish')
let detail = (await api(`/api/sessions/${sid}`)).body as any
console.log(
  'criteria registered:',
  (detail.session.criteria ?? []).map((c: any) => c.description.slice(0, 60)),
)
console.log('board after planning:', (await board()).map(label))
if ((detail.session.criteria ?? []).length !== 2) note('the planner did not register its two criteria')
if (!(await board()).some((t) => t.prompt.startsWith('[idée]') && t.status === 'todo'))
  note('the "for later" remark did not become a [idée] card')

console.log('\n=== 2. Start building (Build & Verify)')
send('runner.launch', { sessionId: sid, workflowId: 'default' })
await sleep(3500)
console.log('workflow status:', status, '| cards still only the idea:', (await board()).length === 1)
send('runner.launch', {
  sessionId: sid,
  workflowId: 'default',
  resumeFrom: 'work_location',
  userChoice: 'Work in current workspace',
})
const seen: string[] = []
const watch = (async () => {
  while (!status.endsWith('=completed') && !status.endsWith('=blocked') && seen.length < 400) {
    const snap = (await board()).map(label).sort().join(' · ')
    if (seen[seen.length - 1] !== snap) seen.push(snap)
    await sleep(500)
  }
})()
const end = Date.now() + 180000
while (Date.now() < end && !status.endsWith('=completed') && !status.endsWith('=blocked')) await sleep(1000)
await watch
await idle(30000)
console.log('workflow:', status)
console.log('steps:', stepOrder.map((s) => s.replace('default:', '')).join(' > '))
console.log('board over time:')
for (const snap of seen) console.log('   ', snap)

console.log('\n=== 3. What the run produced')
detail = (await api(`/api/sessions/${sid}`)).body as any
const subs: string[] = []
for (const m of detail.messages ?? [])
  if (m.subAgentType && subs[subs.length - 1] !== m.subAgentType) subs.push(m.subAgentType)
console.log('sub-agents called, in order:', subs.join(' > '))
const findings = detail.session.metadataEntries?.review_findings ?? []
console.log(
  'review findings:',
  findings.map((f: any) => `${f.status}: ${String(f.description).slice(0, 70)}`),
)
const users = readFileSync(join(dir, 'src/users.js'), 'utf-8')
console.log('src/users.js uses a parameterized query:', users.includes('LIKE ?') && !users.includes("LIKE '%"))
console.log(
  'git status:',
  execFileSync('git', ['status', '--short'], { cwd: dir, encoding: 'utf-8' }).trim().split('\n').join(' | '),
)
const cards = await board()
console.log('final board:')
for (const t of cards)
  console.log(
    '   ',
    label(t),
    '| actors:',
    [...new Set((t.auditTrail ?? []).map((e: any) => e.actorName ?? e.actor))].join(', '),
  )

console.log('\n=== 4. Audit of src/')
send('runner.launch', { sessionId: sid, workflowId: 'dev-audit', params: { scope: 'src' } })
await sleep(3000)
await idle(90000)
console.log('workflow:', status)
console.log('board after the audit:', (await board()).map(label))

console.log('\n=== 5. Checks')
const stepsOnly = stepOrder.filter((s) => s.startsWith('default:')).map((s) => s.slice(8))
const expected = [
  'work_location',
  'architecture',
  'build',
  'verify',
  'code_review',
  'security_review',
  'finalize',
  'summarize',
]
if (expected.join() !== stepsOnly.join()) note(`step order was ${stepsOnly.join(' > ')}`)
for (const id of ['architect', 'test_runner', 'verifier', 'code_reviewer', 'security_reviewer'])
  if (!subs.includes(id)) note(`sub-agent ${id} never ran`)
if (!findings.some((f: any) => f.status === 'resolved')) note('no review finding was resolved')
if (!findings.some((f: any) => f.status === 'dismissed')) note('no review finding was dismissed')
if (!users.includes('LIKE ?')) note('the SQL injection was not fixed in the code')
const labels = cards.map(label)
if (!labels.some((l) => l.startsWith('Add /users search') && l.endsWith('[done]'))) note('the run card is not Done')
if (!labels.some((l) => l.startsWith('[sécurité]'))) note('no [sécurité] card for the out-of-scope finding')
if (!labels.some((l) => l.startsWith('[idée]'))) note('the [idée] card disappeared')
if (!(await board()).some((t) => t.prompt.startsWith('[dette]'))) note('the audit did not record its [dette] card')
const runCards = cards.filter((t) => t.prompt.startsWith('Add /users search'))
if (runCards.length !== 1) note(`expected one card for the run, found ${runCards.length}`)
console.log(
  'scenario model calls:',
  steps.length,
  '| distinct roles:',
  [...new Set(steps.map((s) => s.role))].join(', '),
)

console.log('\n=== 6. Screenshots')
const { browser, page } = await launch('e2e')
page.setDefaultTimeout(10000)
await page.goto(`${BASE}/p/${projectId}/s/${sid}`)
await page.waitForLoadState('networkidle')
await page.waitForTimeout(1500)
await page.screenshot({ path: `${SHOTS}/76-session.png` })
const sidebar = await page.locator('body').innerText()
if (/Tracked Task/i.test(sidebar)) note('the session sidebar shows an internal "Tracked Task" section')
console.log('sidebar shows an internal tracking section:', /Tracked Task/i.test(sidebar))
try {
  await page.getByRole('button', { name: 'Open project tasks' }).first().click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${SHOTS}/76-kanban.png` })
  console.log('kanban text:', (await page.locator('body').innerText()).replace(/\n+/g, ' | ').slice(0, 500))
} catch (e) {
  note(`could not open the Tasks board in the browser: ${(e as Error).message.replace(/\s+/g, ' ').slice(0, 400)}`)
}
await browser.close()
ws.close()
server.close()
report()
process.exit(0)
