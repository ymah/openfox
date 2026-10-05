import WebSocket from 'ws'
import { api, BASE, devProjectOnRepo, note, report } from './lib.js'
import { startFakeLlm } from './fake-llm.js'

const { projectId } = await devProjectOnRepo('kanban-track')
const fake = startFakeLlm(18999)
const mk = async (name: string, mode: string) => {
  const r = await api('/api/providers', {
    json: { name, url: `http://127.0.0.1:18999/${mode}`, backend: 'vllm', model: 'fake-model' },
  })
  return ((r.body as any).provider?.id ?? (r.body as any).id) as string
}
const hang = await mk('fake-hang', 'hang')
const coop = await mk('fake-agent', 'agent')
const sid = ((await api('/api/sessions', { json: { projectId, title: 'Add dark mode' } })).body as any).session.id
const setProvider = (id: string) =>
  api(`/api/sessions/${sid}/provider`, { json: { providerId: id, model: 'fake-model' } })
const board = async () => ((await api(`/api/projects/${projectId}/tasks?status=all`)).body as any).tasks as any[]
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const until = async (pred: () => Promise<boolean>, ms = 20000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await pred()) return true
    await sleep(500)
  }
  return false
}

await setProvider(hang)
const ws = new WebSocket(BASE.replace('http', 'ws'))
await new Promise((r, j) => {
  ws.on('open', r)
  ws.on('error', j)
})
const send = (type: string, payload: unknown) => ws.send(JSON.stringify({ type, id: type, payload }))
send('session.load', { sessionId: sid })
await sleep(800)

// 1. Waiting for the first choice: nothing is being worked on, no card.
send('runner.launch', { sessionId: sid, workflowId: 'default' })
await sleep(3000)
console.log('cards while waiting for the user choice:', (await board()).length)
if ((await board()).length !== 0) note('a card was created while the run only waited for the first choice')

// 2. The run starts working (and hangs on the model): a card is In Progress, bound to the session.
send('runner.launch', {
  sessionId: sid,
  workflowId: 'default',
  resumeFrom: 'work_location',
  userChoice: 'Work in current workspace',
})
const opened = await until(async () => (await board()).some((t) => t.status === 'in_progress'))
let cards = await board()
console.log(
  'card after the run started:',
  cards.map((t) => `${t.status}/${t.runState} session=${t.activeSessionId === sid}`).join(', '),
)
if (!opened) note('no In Progress card once the run started working')
if (cards[0]?.activeSessionId !== sid) note('the card is not bound to the session')
console.log('card text first line:', JSON.stringify(String(cards[0]?.prompt).split('\n')[0]))
if (String(cards[0]?.prompt).split('\n')[0] !== 'Add dark mode') note('the card title is not the session title')
const reminders = ((await api(`/api/sessions/${sid}`)).body as any).messages.filter(
  (m: any) => String(m.content).includes('project task board') || String(m.content).includes('Task "'),
)
console.log('task reminders written into the session:', reminders.length)
if (reminders.length) note('the tracker wrote a reminder into the session')

// 3. Stop the run: the card goes back to To Do with the reason.
await api(`/api/sessions/${sid}/stop`, { method: 'POST' })
const back = await until(async () => (await board()).every((t) => t.status === 'todo'))
cards = await board()
console.log('card after Stop:', cards.map((t) => t.status).join(', '))
if (!back) note('the card did not go back to To Do after the run was stopped')
console.log(
  'audit:',
  cards[0]?.auditTrail
    ?.map((e: any) => `${e.actorName ?? e.actor}: ${e.detail}`)
    .slice(-2)
    .join(' | '),
)

// 4. Resume with a model that cooperates: the same card finishes in Done.
await setProvider(coop)
send('runner.launch', { sessionId: sid, workflowId: 'default', resumeFrom: 'architecture' })
const finished = await until(async () => (await board()).some((t) => t.status === 'done'), 90000)
cards = await board()
console.log('cards after the resumed run:', cards.map((t) => t.status).join(', '))
if (!finished) note('the card did not reach Done after the resumed run')
if (cards.length !== 1) note(`expected one card for the run, found ${cards.length}`)

ws.close()
fake.close()
report()
process.exit(0)
