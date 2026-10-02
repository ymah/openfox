import { ensureProjects, launch, SHOTS, BASE, findings } from './lib.js'
const fx = await ensureProjects()
const { browser, page } = await launch('chathome')
await page.goto(`${BASE}/p/${fx.chat}`)
await page.waitForLoadState('networkidle')
await page.waitForTimeout(600)
await page.screenshot({ path: `${SHOTS}/40-chat-home.png`, fullPage: true })
const gaps = await page
  .locator('section')
  .evaluateAll((els) =>
    els.map((e) => `${e.querySelector('h3')?.textContent ?? 'memory'}: mt=${getComputedStyle(e).marginTop}`),
  )
console.log(gaps.join('\n'))
console.log(findings.join('\n') || 'no findings')
await browser.close()
