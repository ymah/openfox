import { api, devProjectOnRepo, note, report, sendAndWait } from './lib.js'
import { startFakeLlm } from './fake-llm.js'

const { projectId } = await devProjectOnRepo('planner-notes')
const fake = startFakeLlm(18999)
const r = await api('/api/providers', {
  json: { name: 'fake-note', url: 'http://127.0.0.1:18999/note', backend: 'vllm', model: 'fake-model' },
})
const providerId = ((r.body as any).provider?.id ?? (r.body as any).id) as string
const sid = ((await api('/api/sessions', { json: { projectId, title: 'note later' } })).body as any).session.id
await api(`/api/sessions/${sid}/provider`, { json: { providerId, model: 'fake-model' } })
const detail = (await api(`/api/sessions/${sid}`)).body as any
console.log('agent in this session:', detail.session.mode)

await sendAndWait(sid, 'The login redirect loses the target page. Note it for later, do not fix it now.', 40000)
const tasks = ((await api(`/api/projects/${projectId}/tasks?status=all`)).body as any).tasks as any[]
console.log('cards:', tasks.map((t) => `${t.status}: ${String(t.prompt).split('\n')[0]}`).join(' | '))
if (tasks.length !== 1) note(`expected one card from the planner turn, found ${tasks.length}`)
if (!String(tasks[0]?.prompt).startsWith('[bug]')) note('the card does not start with a [bug] tag')
if (tasks[0]?.status !== 'todo') note('a card recorded for later should be in To Do')
const after = ((await api(`/api/sessions/${sid}`)).body as any).messages.filter(
  (m: any) => m.role === 'assistant' && String(m.content).includes('Noted'),
)
console.log('assistant confirmed:', after.length > 0)
fake.close()
report()
process.exit(0)
