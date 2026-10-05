import { execSync } from 'node:child_process'
import { api, ensureProjects, launch, BASE } from './lib.js'
const fx = await ensureProjects()
const src = execSync(`sed -n 8,58p src/server/db/settings.ts`, { encoding: 'utf-8' })
const keys = [...src.matchAll(/'([a-zA-Z_]+(?:\.[a-zA-Z_]+)*)'/g)]
  .map((m) => m[1]!)
  .filter((k) => k === 'keybindings' || k === 'global_instructions' || k.includes('.'))
const { browser, page } = await launch('bisect')
const sid = ((await api('/api/sessions', { json: { projectId: fx.dev, title: 'b' } })).body as any).session.id
const errors: string[] = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)))
const bad: string[] = []
for (const v of ['[1,2,3]']) {
  for (const k of keys) {
    errors.length = 0
    await api(`/api/settings/${k}`, { method: 'PUT', json: { value: v } })
    await page.goto(`${BASE}/`).catch(() => {})
    await page.evaluate(() => localStorage.clear()).catch(() => {})
    await page.goto(`${BASE}/p/${fx.dev}/s/${sid}`).catch(() => {})
    await page.waitForTimeout(900)
    const len = (
      await page
        .locator('body')
        .innerText()
        .catch(() => '')
    ).replace(/\s/g, '').length
    if (errors.length || len < 40) bad.push(`${k} = ${v}  -> ${errors[0] ?? 'blank'}`)
    await api(`/api/settings/${k}`, { method: 'PUT', json: { value: '' } })
  }
}
console.log(bad.length ? bad.join('\n') : 'no single key breaks the page')
await browser.close()
process.exit(0)
