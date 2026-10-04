import { api, devProjectOnRepo, launch, report, seedProvider, SHOTS, BASE, note } from './lib.js'

await seedProvider()
const { projectId } = await devProjectOnRepo('workflow')
const sess = (await api('/api/sessions', { json: { projectId } })).body as { session: { id: string } }
const { browser, page } = await launch('workflow')
await page.goto(`${BASE}/p/${projectId}/s/${sess.session.id}`)
await page.waitForLoadState('networkidle')
await page.locator('textarea').last().fill('Please plan a small change')
await page.getByRole('button', { name: 'Send', exact: true }).last().click()
await page.waitForTimeout(3500)
await page.getByText('Add', { exact: true }).first().click()
await page.getByPlaceholder('New criterion...').fill('Le fichier src/utils.ts existe')
await page.getByPlaceholder('New criterion...').press('Enter')
await page.waitForTimeout(800)
await page.screenshot({ path: `${SHOTS}/240-before-build.png` })
const startBtn = page.getByRole('button', { name: /Build & Verify/ })
console.log('start button visible:', await startBtn.count())
if (!(await startBtn.count())) {
  note('no "Build & Verify" start button after a reply and a pending criterion')
  report()
  await browser.close()
  process.exit(0)
}
await startBtn.first().click()
await page.waitForTimeout(1500)
await page.getByRole('button', { name: 'Work in current workspace' }).click()
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(1000)
  const d = (await api(`/api/sessions/${sess.session.id}`)).body as any
  if (!d.session.isRunning && d.session.phase === 'done') break
}
const d = (await api(`/api/sessions/${sess.session.id}`)).body as any
console.log('final phase:', d.session.phase, '| running:', d.session.isRunning, '| mode:', d.session.mode)
console.log(
  'criteria:',
  JSON.stringify((d.session.metadataEntries?.criteria ?? []).map((c: any) => c.status ?? c.value)).slice(0, 200),
)
await page.waitForTimeout(800)
await page.screenshot({ path: `${SHOTS}/241-after-build.png` })
const text = (await page.locator('body').innerText()).replace(/\n+/g, ' | ')
console.log('UI mentions workflow progress:', /Build & Verify|Verif|Done/.test(text))
console.log(
  'buttons now:',
  (await page.locator('button').allTextContents())
    .map((t) => t.trim())
    .filter((t) => /Continue|Retry|Build|Start|Verify/i.test(t)),
)
report()
await browser.close()
