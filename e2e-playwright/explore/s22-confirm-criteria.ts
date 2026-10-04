import { api, devProjectOnRepo, launch, report, seedProvider, SHOTS, BASE, note } from './lib.js'

await seedProvider()
const { projectId } = await devProjectOnRepo('confirm-criteria')
const sess = (await api('/api/sessions', { json: { projectId } })).body as { session: { id: string } }
await api(`/api/sessions/${sess.session.id}/mode`, { method: 'PUT', json: { mode: 'builder' } })
const { browser, page } = await launch('confirm')
await page.goto(`${BASE}/p/${projectId}/s/${sess.session.id}`)
await page.waitForLoadState('networkidle')
async function say(text: string, waitMs = 2500) {
  await page.locator('textarea').last().fill(text)
  await page.getByRole('button', { name: 'Send', exact: true }).last().click()
  await page.waitForTimeout(waitMs)
}
const toolCards = async () =>
  (await page.locator('.feed-item').allTextContents())
    .map((t) => t.replace(/\s+/g, ' ').slice(0, 160))
    .filter((t) => /run_command/.test(t))

// Deny
await say('Run exactly: cat /etc/hosts')
await page.getByRole('button', { name: 'Deny', exact: true }).click()
await page.waitForTimeout(3000)
console.log(
  'after Deny, running indicator:',
  await page.getByText(/Waiting for input/).count(),
  '| tool card:',
  (await toolCards()).at(-1),
)
await page.screenshot({ path: `${SHOTS}/220-after-deny.png` })

// Allow
await say('Run exactly: cat /etc/hosts')
await page.getByRole('button', { name: 'Allow', exact: true }).click()
await page.waitForTimeout(3500)
console.log('after Allow, tool card:', (await toolCards()).at(-1))
const ok = (await toolCards()).at(-1) ?? ''
if (/denied|refus/i.test(ok)) note('Allow after a Deny still reports the path as denied')
await page.screenshot({ path: `${SHOTS}/221-after-allow.png` })

// Stop during a path-confirmation wait
await say('Run exactly: cat /etc/passwd', 1500)
const stopBtn = page.locator('button[title*="top" i], button[aria-label*="top" i]').first()
console.log('stop button visible while waiting:', await stopBtn.isVisible().catch(() => false))
await stopBtn.click().catch(() => note('could not click Stop while a path confirmation is pending'))
await page.waitForTimeout(2000)
const d = (await api(`/api/sessions/${sess.session.id}`)).body as { session: { isRunning: boolean } }
console.log('running after Stop (should be false):', d.session.isRunning)
if (d.session.isRunning) note('Stop did not end a turn waiting on a path confirmation')
console.log('confirmation card still shown after Stop:', await page.getByText('Path Access Request').count())
await page.screenshot({ path: `${SHOTS}/222-after-stop.png` })

// Criteria panel: what does "+ Add" open?
await page.getByText('Add', { exact: true }).first().click()
await page.waitForTimeout(500)
await page.screenshot({ path: `${SHOTS}/223-criteria.png` })
console.log(
  'inputs after + Add:',
  await page
    .locator('input, textarea')
    .evaluateAll((els) => els.map((e) => `${e.tagName}|${(e as HTMLInputElement).placeholder}`)),
)
report()
await browser.close()
