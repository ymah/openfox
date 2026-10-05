import { execSync } from 'node:child_process'
import { api, ensureProjects, launch, note, report, sendAndWait, BASE } from './lib.js'
const fx = await ensureProjects()
const src = execSync(`sed -n 8,58p src/server/db/settings.ts`, { encoding: 'utf-8' })
const keys = [...src.matchAll(/'([a-zA-Z_]+(?:\.[a-zA-Z_]+)*)'/g)]
  .map((m) => m[1]!)
  .filter((k) => k === 'keybindings' || k === 'global_instructions' || k.includes('.'))
console.log('keys', keys.length)
const values: unknown[] = [
  '',
  '{',
  '[]',
  'null',
  '{"a":1}',
  '-1',
  '999999999999',
  '<script>alert(1)</script>',
  '\u0000 ',
  'x'.repeat(200_000),
  'true',
  'false',
  '[1,2,3]',
  '{"presets":5}',
]
const originals: Record<string, unknown> = {}
for (const k of keys)
  originals[k] =
    ((await api(`/api/settings?keys=${k}`)).body as any)?.settings?.[k] ??
    ((await api(`/api/settings?keys=${k}`)).body as any)?.[k]
const sid = (
  (await api('/api/sessions', { json: { projectId: fx.dev, title: 'bad settings' } })).body as {
    session: { id: string }
  }
).session.id
const { browser, page } = await launch('bad-settings')
page.setDefaultTimeout(8000)
const errors: string[] = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 150)))
for (const v of values) {
  errors.length = 0
  for (const k of keys) await api(`/api/settings/${k}`, { method: 'PUT', json: { value: v } })
  const label = typeof v === 'string' ? JSON.stringify(v.slice(0, 20)) : String(v)
  for (const path of ['/', `/p/${fx.dev}/s/${sid}`]) {
    await page.goto(`${BASE}${path}`).catch(() => {})
    await page.waitForTimeout(1500)
    const len = (
      await page
        .locator('body')
        .innerText()
        .catch(() => '')
    ).replace(/\s/g, '').length
    if (len < 40) note(`blank page at ${path} with every setting = ${label}`)
  }
  await sendAndWait(sid, 'hello under bad settings', 15000)
  const st = ((await api(`/api/sessions/${sid}`)).body as any).session
  if (st?.isRunning) note(`turn stuck with every setting = ${label}`)
  if (errors.length) note(`pageerror with every setting = ${label}: ${[...new Set(errors)].join(' | ')}`)
  const health = (await api('/api/health')).status
  console.log(label.padEnd(28), 'errors', errors.length, 'health', health)
}
for (const k of keys)
  if (originals[k] !== undefined) await api(`/api/settings/${k}`, { method: 'PUT', json: { value: originals[k] } })
report()
await browser.close()
process.exit(0)
