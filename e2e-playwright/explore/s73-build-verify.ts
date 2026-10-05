import WebSocket from 'ws'
import { api, BASE, devProjectOnRepo, note, report } from './lib.js'
import { startFakeLlm } from './fake-llm.js'

const { projectId } = await devProjectOnRepo('bv-steps')
const fake = startFakeLlm(18999)
const prov = await api('/api/providers', {
  json: { name: 'fake-agent', url: 'http://127.0.0.1:18999/agent', backend: 'vllm', model: 'fake-model' },
})
const providerId = (prov.body as any).provider?.id ?? (prov.body as any).id
const sid = ((await api('/api/sessions', { json: { projectId, title: 'bv' } })).body as any).session.id
await api(`/api/sessions/${sid}/provider`, { json: { providerId, model: 'fake-model' } })

const ws = new WebSocket(BASE.replace('http', 'ws'))
await new Promise((r, j) => {
  ws.on('open', r)
  ws.on('error', j)
})
const steps: string[] = []
let status = ''
ws.on('message', (raw) => {
  try {
    const m = JSON.parse(String(raw))
    if (m.type === 'workflow.execution_changed') {
      const p = m.payload as { currentStepId?: string; status?: string }
      if (p.currentStepId && steps[steps.length - 1] !== p.currentStepId) steps.push(p.currentStepId)
      if (p.status) status = p.status
    }
  } catch {}
})
const send = (type: string, payload: unknown) => ws.send(JSON.stringify({ type, id: type, payload }))
send('session.load', { sessionId: sid })
await new Promise((r) => setTimeout(r, 800))
send('runner.launch', { sessionId: sid, workflowId: 'default' })
await new Promise((r) => setTimeout(r, 4000))
console.log('after launch:', status, 'steps so far:', steps.join(' > '))
send('runner.launch', {
  sessionId: sid,
  workflowId: 'default',
  resumeFrom: 'work_location',
  userChoice: 'Work in current workspace',
})
const end = Date.now() + 90000
while (Date.now() < end) {
  await new Promise((r) => setTimeout(r, 1500))
  const st = ((await api(`/api/sessions/${sid}`)).body as any).session
  if (st?.isRunning === false && Date.now() > end - 85000) break
}
console.log('status:', status)
console.log('step order:', steps.join(' > '))
const i = (s: string) => steps.indexOf(s)
if (i('architecture') === -1) note('architecture step never ran')
else if (!(i('architecture') < i('build'))) note('architecture did not run before build')
if (i('security_review') !== -1 && !(i('code_review') < i('security_review') && i('security_review') < i('finalize')))
  note('security review is not between code review and finalize')
const detail = (await api(`/api/sessions/${sid}`)).body as any
console.log(
  'sub-agents:',
  [...new Set((detail.messages ?? []).map((m: any) => m.subAgentType).filter(Boolean))].join(', '),
)
ws.close()
fake.close()
report()
process.exit(0)
