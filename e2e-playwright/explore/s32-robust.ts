import { api, devProjectOnRepo, launch, report, seedProvider, SHOTS, BASE, note } from './lib.js'

await seedProvider()
const { projectId } = await devProjectOnRepo('robust')
const sess = (await api('/api/sessions', { json: { projectId } })).body as { session: { id: string } }
await api(`/api/sessions/${sess.session.id}/mode`, { method: 'PUT', json: { mode: 'builder' } })
const url = `${BASE}/p/${projectId}/s/${sess.session.id}`
const feedText = async (page: import('@playwright/test').Page) =>
  (await page.locator('.feed-item').allTextContents()).join(' | ').replace(/\s+/g, ' ')

// A) reload in the middle of a running tool
const a = await launch('reload-mid-turn')
await a.page.goto(url)
await a.page.waitForLoadState('networkidle')
await a.page.locator('textarea').last().fill('Run exactly: sleep 4 && echo finished-after-reload')
await a.page.getByRole('button', { name: 'Send', exact: true }).last().click()
await a.page.waitForTimeout(1500)
await a.page.reload()
await a.page.waitForLoadState('networkidle')
await a.page.waitForTimeout(500)
const runningAfterReload = await a.page
  .locator('[data-testid="session-status-indicator"]')
  .getAttribute('data-state')
  .catch(() => null)
console.log('A) status right after reload:', runningAfterReload)
await a.page.waitForTimeout(6000)
const finalText = await feedText(a.page)
console.log('A) result visible without another reload:', finalText.includes('finished-after-reload'))
if (!finalText.includes('finished-after-reload'))
  note('after a reload mid-turn, the tool result never appeared until another reload')
await a.page.screenshot({ path: `${SHOTS}/320-reload-mid-turn.png` })

// B) two tabs on the same session
const ctx2 = await a.browser.newContext({ viewport: { width: 1400, height: 900 } })
const tabB = await ctx2.newPage()
await tabB.goto(url)
await tabB.waitForLoadState('networkidle')
await a.page.locator('textarea').last().fill('Run exactly: echo from-tab-a')
await a.page.getByRole('button', { name: 'Send', exact: true }).last().click()
await a.page.waitForTimeout(3500)
const bText = await feedText(tabB)
console.log("B) tab B sees tab A's message and result:", bText.includes('from-tab-a'))
if (!bText.includes('from-tab-a')) note('a message sent in one tab does not appear in a second tab on the same session')
const dupes = (bText.match(/Run exactly: echo from-tab-a/g) ?? []).length
console.log('B) message appears', dupes, 'time(s) in tab B')
if (dupes > 1) note('message duplicated in the second tab')

// C) connection lost then restored while idle, then send
await a.page.context().setOffline(true)
await a.page.waitForTimeout(2500)
const offlineBanner =
  (await a.page.locator('body').innerText()).match(/offline|disconnect|reconnect|connexion/i)?.[0] ?? null
console.log('C) indicator while offline:', offlineBanner)
await a.page.context().setOffline(false)
await a.page.waitForTimeout(5000)
await a.page.locator('textarea').last().fill('Run exactly: echo after-reconnect')
await a.page.getByRole('button', { name: 'Send', exact: true }).last().click()
await a.page.waitForTimeout(4000)
const after = await feedText(a.page)
console.log('C) works after reconnect:', after.includes('after-reconnect'))
if (!after.includes('after-reconnect')) note('sending after the connection came back did not work')
await a.page.screenshot({ path: `${SHOTS}/321-after-reconnect.png` })
report()
await a.browser.close()
