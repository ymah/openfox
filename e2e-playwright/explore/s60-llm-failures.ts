import { api, ensureProjects, note, report } from './lib.js'
import { startFakeLlm } from './fake-llm.js'
const fx = await ensureProjects()
const fake = startFakeLlm(18999)
const modes = (process.env['MODES'] ?? 'ok,http500,http429,html,cut,garbage,empty,badtool,huge,stall,hang').split(',')
for (const mode of modes) {
  const p = await api('/api/providers', {
    json: { name: `fake-${mode}`, url: `http://127.0.0.1:18999/${mode}`, backend: 'vllm', model: 'fake-model' },
  })
  const pid = (p.body as any).provider?.id ?? (p.body as any).id
  const sid = ((await api('/api/sessions', { json: { projectId: fx.chat, title: `llm ${mode}` } })).body as any).session
    .id
  const set = await api(`/api/sessions/${sid}/provider`, { json: { providerId: pid, model: 'fake-model' } })
  await api(`/api/sessions/${sid}/message`, { json: { content: 'hello' } })
  const t0 = Date.now()
  let running = true,
    last: any
  const limit = ['stall', 'hang'].includes(mode) ? 20000 : 25000
  while (Date.now() - t0 < limit) {
    await new Promise((r) => setTimeout(r, 500))
    last = (await api(`/api/sessions/${sid}`)).body
    if (last.session?.isRunning === false && Date.now() - t0 > 1500) {
      running = false
      break
    }
  }
  let stopped = ''
  if (running) {
    const s = await api(`/api/sessions/${sid}/stop`, { method: 'POST' })
    await new Promise((r) => setTimeout(r, 2000))
    const after = ((await api(`/api/sessions/${sid}`)).body as any).session
    stopped = ` | stop->${s.status}, running after stop: ${after?.isRunning}`
    if (after?.isRunning) note(`${mode}: session still running after stop`)
  }
  const msgs = (last?.messages ?? []) as { role: string; content: string }[]
  const tail = msgs
    .filter((m) => m.role !== 'system')
    .slice(-2)
    .map((m) => `${m.role}:${(m.content ?? '').slice(0, 60).replace(/\n/g, ' ')}`)
  console.log(
    mode.padEnd(8),
    `provider set ${set.status}`,
    `ended in ${Date.now() - t0}ms`,
    running ? 'STILL RUNNING' : 'idle',
    stopped,
    '|',
    tail.join(' || '),
  )
  if (running && !['stall', 'hang'].includes(mode)) note(`${mode}: turn did not end within ${limit}ms`)
  if (running && ['stall', 'hang'].includes(mode))
    note(`${mode}: no timeout, turn stays running until manual stop (${limit}ms)`)
}
console.log('health', (await api('/api/health')).status)
report()
fake.close()
process.exit(0)
