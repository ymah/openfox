import { api, devProjectOnRepo, launch, report, seedProvider, SHOTS, BASE, note, findings } from './lib.js'

await seedProvider()
const { projectId } = await devProjectOnRepo('errors')
const sess = (await api('/api/sessions', { json: { projectId } })).body as { session: { id: string } }
const { browser, page } = await launch('errors')

async function visit(name: string, pattern: string, path: string, status = 500) {
  await page.unrouteAll({ behavior: 'ignoreErrors' })
  await page.route(pattern, (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ error: 'Simulated failure' }) }),
  )
  const before = findings.length
  await page.goto(`${BASE}${path}`)
  await page.waitForTimeout(3500)
  const text = (await page.locator('body').innerText()).replace(/\n+/g, ' | ')
  const blank = text.replace(/\s|\|/g, '').length < 20
  const spinner = (await page.locator('[class*="animate-spin"], [role="progressbar"]').count()) > 0
  await page.screenshot({ path: `${SHOTS}/330-${name}.png` })
  console.log(
    name.padEnd(18),
    'blank page:',
    blank,
    '| spinner still spinning:',
    spinner,
    '| text:',
    text.slice(0, 220),
  )
  if (blank) note(`${name}: blank page when ${pattern} returns ${status}`)
  if (spinner) note(`${name}: spinner never stops when ${pattern} returns ${status}`)
  void before
}

await visit('projects-500', '**/api/projects', '/')
await visit('project-500', `**/api/projects/${projectId}`, `/p/${projectId}`)
await visit('session-500', `**/api/sessions/${sess.session.id}`, `/p/${projectId}/s/${sess.session.id}`)
await visit('session-404', `**/api/sessions/${sess.session.id}`, `/p/${projectId}/s/${sess.session.id}`, 404)
await visit('agents-500', '**/api/agents*', `/p/${projectId}/s/${sess.session.id}`)
await visit('workflows-500', '**/api/workflows*', `/p/${projectId}/s/${sess.session.id}`)
await visit('config-500', '**/api/config', '/')
await visit('plugins-500', '**/api/plugins/list', `/p/${projectId}`)
await page.unrouteAll({ behavior: 'ignoreErrors' })
// unknown ids
for (const [name, path] of [
  ['unknown-project', '/p/nope'],
  ['unknown-session', `/p/${projectId}/s/nope`],
  ['unknown-route', '/does/not/exist'],
] as const) {
  await page.goto(`${BASE}${path}`)
  await page.waitForTimeout(2500)
  const text = (await page.locator('body').innerText()).replace(/\n+/g, ' | ')
  const blank = text.replace(/\s|\|/g, '').length < 20
  console.log(name.padEnd(18), 'blank:', blank, '| text:', text.slice(0, 220))
  await page.screenshot({ path: `${SHOTS}/331-${name}.png` })
  if (blank) note(`${name}: blank page`)
}
report()
await browser.close()
