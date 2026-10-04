import { ensureProjects, launch, report, SHOTS, BASE } from './lib.js'

await ensureProjects()
const { browser, page } = await launch('settings')
await page.goto(BASE)
await page.waitForLoadState('networkidle')
await page.locator('button[title*="ettings" i]').first().click()
await page.waitForTimeout(700)
for (const tab of [
  'Instructions',
  'Tools',
  'Skills',
  'Plugins',
  'Notifications',
  'Display',
  'Keybindings',
  'Advanced',
]) {
  await page.getByRole('button', { name: tab, exact: true }).last().click()
  await page.waitForTimeout(700)
  const count = async (sel: string) => page.locator(sel).count()
  const inv = {
    inputs: await count('input:not([type=hidden])'),
    selects: await count('select'),
    textareas: await count('textarea'),
    switches: await count('[role=switch]'),
    buttons: await count('button'),
  }
  console.log(tab.padEnd(14), JSON.stringify(inv))
  await page.screenshot({ path: `${SHOTS}/300-settings-${tab}.png` })
}
report()
await browser.close()
