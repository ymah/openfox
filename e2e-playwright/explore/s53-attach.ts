import { writeFileSync } from 'node:fs'
import { api, ensureProjects, launch, note, report, BASE, SHOTS } from './lib.js'
const fx = await ensureProjects()
const sid = (
  (await api('/api/sessions', { json: { projectId: fx.chat, title: 'attach' } })).body as { session: { id: string } }
).session.id
const { browser, page } = await launch('attach')
await page.goto(`${BASE}/p/${fx.chat}/s/${sid}`)
await page.waitForLoadState('networkidle')
const dir = '/tmp/explore-attach'
;(await import('node:fs')).mkdirSync(dir, { recursive: true })
writeFileSync(`${dir}/note.txt`, 'hello attachment')
writeFileSync(`${dir}/big.txt`, 'x'.repeat(2 * 1024 * 1024))
writeFileSync(`${dir}/doc.pdf`, '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF')
writeFileSync(`${dir}/prog.exe`, 'MZ....')
writeFileSync(`${dir}/empty.txt`, '')
// 1x1 png
writeFileSync(
  `${dir}/pic.png`,
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
)
const input = page.locator('input[type="file"]').nth(1)
console.log(
  'file inputs:',
  await page.locator('input[type="file"]').count(),
  'accept=',
  await input.getAttribute('accept'),
)
for (const f of ['note.txt', 'pic.png', 'doc.pdf', 'big.txt', 'prog.exe', 'empty.txt']) {
  const before = await page.locator('body').innerText()
  await input.setInputFiles(`${dir}/${f}`)
  await page.waitForTimeout(900)
  const after = await page.locator('body').innerText()
  const toast = after
    .split('\n')
    .filter((l) => /too large|not supported|unsupported|error|invalid|failed/i.test(l) && !before.includes(l))
  console.log(f.padEnd(10), 'chip shown:', after.includes(f), '| messages:', toast.join(' / ').slice(0, 120))
  if (f === 'big.txt' && after.includes('big.txt')) note('2MB text file accepted although the text limit is 1MB')
}
await page.screenshot({ path: `${SHOTS}/53-attachments.png` })
// send with attachments
await page
  .getByPlaceholder(/message/i)
  .first()
  .fill('see attachments')
await page.keyboard.press('Enter')
await page.waitForTimeout(4000)
const st = (await api(`/api/sessions/${sid}`)).body as { messages: { role: string; attachments?: unknown[] }[] }
const user = st.messages.find((m) => m.role === 'user')
console.log('user message attachments stored:', user?.attachments?.length)
await page.screenshot({ path: `${SHOTS}/53-sent.png` })
report()
await browser.close()
