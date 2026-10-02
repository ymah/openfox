import { api, ensureProjects, launch, SHOTS, BASE, findings, note } from './lib.js'
const fx = await ensureProjects()
const { browser, page } = await launch('writing')
for (const [name, path] of [
  ['writing-home', `/p/${fx.writing}`],
  ['codex', `/p/${fx.writing}/codex`],
  ['manuscript', `/p/${fx.writing}/manuscript`],
  ['gtd-home', `/p/${fx.gtd}`],
] as const) {
  await page.goto(`${BASE}${path}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${SHOTS}/130-${name}.png` })
  console.log(name, '|', (await page.locator('body').innerText()).replace(/\n+/g, ' | ').slice(0, 220))
}
console.log('findings:', findings.join('\n') || 'none')
await browser.close()
