import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { api, devProjectOnRepo, launch, report, seedProvider, SHOTS, BASE, note } from './lib.js'

await seedProvider()
const { projectId, dir } = await devProjectOnRepo('builder-paths')
const sess = (await api('/api/sessions', { json: { projectId } })).body as { session: { id: string } }
await api(`/api/sessions/${sess.session.id}/mode`, { method: 'PUT', json: { mode: 'builder' } })
const { browser, page } = await launch('builder')
await page.goto(`${BASE}/p/${projectId}/s/${sess.session.id}`)
await page.waitForLoadState('networkidle')
async function say(text: string, waitMs = 4500) {
  await page.locator('textarea').last().fill(text)
  await page.getByRole('button', { name: 'Send', exact: true }).last().click()
  await page.waitForTimeout(waitMs)
}
console.log(
  'agent shown:',
  (
    await page
      .getByRole('button', { name: /^(Builder|Planner)/ })
      .first()
      .textContent()
  )?.trim(),
)

await say('Create a new file called src/utils.ts')
console.log('file created on disk:', existsSync(join(dir, 'src/utils.ts')))
if (!existsSync(join(dir, 'src/utils.ts'))) note('Builder: "Create a new file" did not create the file')
await page.screenshot({ path: `${SHOTS}/210-builder-write.png` })

// a path outside the project → confirmation
await say('Run exactly: cat /etc/hosts', 3000)
await page.screenshot({ path: `${SHOTS}/211-path-confirm.png` })
const body = (await page.locator('body').innerText()).replace(/\n+/g, ' | ')
console.log('path confirmation visible:', /outside|allow|Approve|Deny|confirm/i.test(body))
console.log(
  'buttons:',
  (await page.locator('button').allTextContents())
    .map((t) => t.trim())
    .filter((t) => /allow|deny|approve|reject|always|once/i.test(t)),
)
report()
await browser.close()
