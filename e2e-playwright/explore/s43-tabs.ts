import { api, ensureProjects, launch, note, report, sendAndWait, BASE, SHOTS } from './lib.js'
const fx = await ensureProjects()
const sid = (
  (await api('/api/sessions', { json: { projectId: fx.chat, title: 'two tabs' } })).body as { session: { id: string } }
).session.id
const url = `${BASE}/p/${fx.chat}/s/${sid}`
const a = await launch('tab-a')
const b = await launch('tab-b')
await a.page.goto(url)
await b.page.goto(url)
await a.page.waitForLoadState('networkidle')
await b.page.waitForLoadState('networkidle')
// send from A, B should show it once
const box = a.page.getByPlaceholder(/message|type/i).first()
await box.fill('hello from tab A')
await a.page.keyboard.press('Enter')
await a.page.waitForTimeout(3500)
const count = async (p: typeof a.page, txt: string) => await p.getByText(txt, { exact: false }).count()
console.log(
  'A sees user msg x',
  await count(a.page, 'hello from tab A'),
  '| B sees x',
  await count(b.page, 'hello from tab A'),
)
if ((await count(b.page, 'hello from tab A')) !== 1)
  note(`tab B shows the message ${await count(b.page, 'hello from tab A')} times`)
// reload B mid-turn
await api(`/api/sessions/${sid}/message`, { json: { content: 'second message' } })
await b.page.reload()
await b.page.waitForLoadState('networkidle')
await b.page.waitForTimeout(3500)
console.log('B after reload sees second x', await count(b.page, 'second message'))
if ((await count(b.page, 'second message')) < 1) note('reload lost a message')
// long conversation: 120 messages through the API quickly
for (let i = 0; i < 40; i++)
  await api(`/api/sessions/${sid}/message`, { json: { content: `bulk ${i} ` + 'lorem '.repeat(80) } })
await new Promise((r) => setTimeout(r, 15000))
const t0 = Date.now()
await a.page.reload()
await a.page.waitForLoadState('networkidle')
await a.page.waitForTimeout(1500)
console.log('reload with long chat ms', Date.now() - t0)
const dom = await a.page.locator('[data-testid="message"], .message, article').count()
console.log('dom message nodes', dom)
await a.page.screenshot({ path: `${SHOTS}/43-long.png` })
// delete the session while B has it open
await api(`/api/sessions/${sid}`, { method: 'DELETE' })
await b.page.waitForTimeout(2500)
console.log('B after delete:', (await b.page.locator('body').innerText()).replace(/\n+/g, ' | ').slice(0, 200))
await b.page.screenshot({ path: `${SHOTS}/43-deleted.png` })
report()
await a.browser.close()
await b.browser.close()
