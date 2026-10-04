import { api, ensureProjects, launch, note, report, SHOTS, BASE } from './lib.js'
const fx = await ensureProjects()
const wf = (await api('/api/workflows')).body as {
  workflows?: { id: string; name: string; category?: string }[]
} & Record<string, unknown>
const list = (wf.workflows ?? (wf as any).defaults ?? []) as { id: string; name: string; category?: string }[]
console.log('workflows:', list.map((w) => `${w.id}[${w.category ?? '-'}]`).join(' '))
const { browser, page } = await launch('gtd')
await page.goto(`${BASE}/p/${fx.gtd}`)
await page.waitForLoadState('networkidle')
await page.waitForTimeout(800)
console.log('gtd home:', (await page.locator('body').innerText()).replace(/\n+/g, ' | ').slice(0, 400))
await page.screenshot({ path: `${SHOTS}/41-gtd-home.png` })
const sess = (await api('/api/sessions', { json: { projectId: fx.gtd, title: 'gtd s' } })).body as {
  session: { id: string }
}
await page.goto(`${BASE}/p/${fx.gtd}/s/${sess.session.id}`)
await page.waitForLoadState('networkidle')
await page.waitForTimeout(1200)
const btns = (await page.getByRole('button').allTextContents()).map((b) => b.trim()).filter(Boolean)
console.log('buttons:', btns.join(' / ').slice(0, 500))
if (btns.some((b) => /^Chat\b/.test(b))) note('Chat buttons visible in a GTD project')
if (btns.some((b) => /Build & Verify|Build \u0026 Verify/.test(b))) note('dev workflow button in GTD project')
if (!btns.some((b) => /Capture/i.test(b))) note('no GTD Capture button in a GTD session')
await page.screenshot({ path: `${SHOTS}/41-gtd-session.png` })
report()
await browser.close()
