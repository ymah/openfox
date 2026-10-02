import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { api, launch, seedProvider, SHOTS, BASE, note, findings } from './lib.js'

await seedProvider()
const { browser, page } = await launch('create-all')
const cfg = (await api('/api/config')).body as { workdir: string }

for (const [tab, type] of [
  ['Dev', 'dev'],
  ['Chat', 'chat'],
  ['GTD', 'gtd'],
  ['Writing', 'writing'],
] as const) {
  const name = `ui-${type}`
  await page.goto(BASE)
  await page.waitForLoadState('networkidle')
  await page.getByRole('tab', { name: tab }).click()
  await page.getByRole('button', { name: 'Open Project' }).click()
  await page.getByRole('button', { name: 'Create new project' }).click()
  await page.getByPlaceholder('my-project').fill(name)
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await page
    .waitForURL(/\/p\//, { timeout: 8000 })
    .catch(() => note(`${tab}: did not navigate to the project after Create (url=${page.url()})`))
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${SHOTS}/30-created-${type}.png` })

  const projects = (await api('/api/projects')).body as {
    projects: { name: string; type?: string; defaultAgent?: string; workdir: string }[]
  }
  const p = projects.projects.find((x) => x.name === name)
  if (!p) {
    note(`${tab}: project not in the API after creation`)
    continue
  }
  if ((p.type ?? 'dev') !== type) note(`${tab}: created with type ${p.type}, expected ${type}`)
  const hasGit = existsSync(join(p.workdir, '.git'))
  console.log(`${tab}: type=${p.type} defaultAgent=${p.defaultAgent} git=${hasGit} url=${page.url().replace(BASE, '')}`)
  if (type === 'chat' && hasGit) note('Chat project got a .git folder')
  if (type !== 'chat' && !hasGit) console.log(`  (no .git in ${type} project — autoGitInit default?)`)
}
console.log('workdir:', cfg.workdir)
console.log(findings.length ? findings.join('\n') : 'no findings')
await browser.close()
