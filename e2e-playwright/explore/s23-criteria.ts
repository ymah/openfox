import { api, devProjectOnRepo, launch, report, seedProvider, SHOTS, BASE, note } from './lib.js'

await seedProvider()
const { projectId } = await devProjectOnRepo('criteria')
const sess = (await api('/api/sessions', { json: { projectId } })).body as { session: { id: string } }
const { browser, page } = await launch('criteria')
await page.goto(`${BASE}/p/${projectId}/s/${sess.session.id}`)
await page.waitForLoadState('networkidle')
const criteriaApi = async () =>
  (((await api(`/api/sessions/${sess.session.id}`)).body as any).session.metadataEntries?.criteria ?? []) as {
    id: string
    value?: string
    description?: string
    status?: unknown
  }[]

const add = async (text: string) => {
  await page.getByText('Add', { exact: true }).first().click()
  await page.getByPlaceholder('New criterion...').fill(text)
  await page.getByPlaceholder('New criterion...').press('Enter')
  await page.waitForTimeout(700)
}
await add('Le fichier utils existe')
await add('Les tests passent')
console.log(
  'after 2 adds, in UI:',
  await page.getByText('Le fichier utils existe').count(),
  await page.getByText('Les tests passent').count(),
  '| in API:',
  (await criteriaApi()).length,
)
await page.screenshot({ path: `${SHOTS}/230-criteria-added.png` })

// empty and duplicate input
await page
  .getByText('Add', { exact: true })
  .first()
  .click()
  .catch(() => {})
await page.getByPlaceholder('New criterion...').fill('   ')
await page.getByPlaceholder('New criterion...').press('Enter')
await page.waitForTimeout(500)
console.log('after blank submit, criteria in API (should still be 2):', (await criteriaApi()).length)
if ((await criteriaApi()).length !== 2) note('a blank criterion was accepted')
await page.getByPlaceholder('New criterion...').fill('Les tests passent')
await page.getByPlaceholder('New criterion...').press('Enter')
await page.waitForTimeout(500)
console.log('after duplicate submit, criteria in API:', (await criteriaApi()).length)

// edit & delete: what controls does a criterion row expose?
const row = page.locator('text=Le fichier utils existe').first()
await row.hover()
await page.waitForTimeout(300)
const rowControls = await page
  .locator('button')
  .evaluateAll((els) =>
    els
      .map((e) => e.getAttribute('title') || e.getAttribute('aria-label'))
      .filter((t) => t && /dit|elete|emove|ancel|Supprim|Modif/i.test(t)),
  )
console.log('row controls:', rowControls)
await page.screenshot({ path: `${SHOTS}/231-criteria-hover.png` })
const del = page.locator('button[title*="elete" i], button[title*="emove" i], button[aria-label*="elete" i]').first()
if (await del.count()) {
  await del.click({ force: true })
  await page.waitForTimeout(600)
  console.log('after delete, in API:', (await criteriaApi()).length)
}
report()
await browser.close()
