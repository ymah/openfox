import WebSocket from 'ws'
import { api, BASE, devProjectOnRepo } from './lib.js'
import { startFakeLlm } from './fake-llm.js'
const { projectId } = await devProjectOnRepo('probe-flow')
const fake = startFakeLlm(18999)
const r = await api('/api/providers', {
  json: { name: 'fake-agent', url: 'http://127.0.0.1:18999/agent', backend: 'vllm', model: 'fake-model' },
})
const providerId = ((r.body as any).provider?.id ?? (r.body as any).id) as string
const sid = ((await api('/api/sessions', { json: { projectId, title: 'probe' } })).body as any).session.id
await api(`/api/sessions/${sid}/provider`, { json: { providerId, model: 'fake-model' } })
const ws = new WebSocket(BASE.replace('http', 'ws'))
await new Promise((x, j) => {
  ws.on('open', x)
  ws.on('error', j)
})
const events: string[] = []
ws.on('message', (raw) => {
  try {
    const m = JSON.parse(String(raw))
    if (['workflow.execution_changed', 'phase.changed', 'chat.ask_user', 'workflow.waiting'].includes(m.type))
      events.push(m.type + ' ' + JSON.stringify(m.payload).slice(0, 110))
  } catch {}
})
ws.send(JSON.stringify({ type: 'session.load', id: 'l', payload: { sessionId: sid } }))
await new Promise((x) => setTimeout(x, 800))
await api(`/api/sessions/${sid}/message`, { json: { content: 'Add a /users search endpoint with a q parameter' } })
await new Promise((x) => setTimeout(x, 6000))
console.log(events.join('\n'))
const d = (await api(`/api/sessions/${sid}`)).body as any
console.log('mode', d.session.mode, 'phase', d.session.phase, 'running', d.session.isRunning)
ws.close()
fake.close()
process.exit(0)
