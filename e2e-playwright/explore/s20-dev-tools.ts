import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { api, devProjectOnRepo, launch, report, seedProvider, SHOTS, BASE, note } from './lib.js'

await seedProvider()
const { projectId, dir } = await devProjectOnRepo('dev-tools')
const sess = (await api('/api/sessions', { json: { projectId } })).body as { session: { id: string } }
const { browser, page } = await launch('dev-tools')
await page.goto(`${BASE}/p/${projectId}/s/${sess.session.id}`)
await page.waitForLoadState('networkidle')

async function say(text: string, waitMs = 4500) {
  const box = page.locator('textarea').last()
  await box.fill(text)
  await page.getByRole('button', { name: 'Send', exact: true }).last().click()
  await page.waitForTimeout(waitMs)
}
const feed = async () =>
  (await page.locator('.feed-item').allTextContents()).map((t) => t.replace(/\s+/g, ' ').slice(0, 140))

// a) run_command
await say('Run the exact command: echo hello-explore')
await page.screenshot({ path: `${SHOTS}/200-run-command.png` })
const afterRun = (await feed()).join(' | ')
console.log('run_command shows output:', afterRun.includes('hello-explore'))
if (!afterRun.includes('hello-explore')) note('run_command output not visible in the feed')

// b) write_file
await say('Create a new file called src/utils.ts')
console.log('file created on disk:', existsSync(join(dir, 'src/utils.ts')))
await page.screenshot({ path: `${SHOTS}/201-write-file.png` })

// c) failing command
await say('Run the command "ls /nonexistent/path/xyz" to list files')
await page.screenshot({ path: `${SHOTS}/202-failing-command.png` })
console.log('feed tail:', (await feed()).slice(-4))
report()
await browser.close()
