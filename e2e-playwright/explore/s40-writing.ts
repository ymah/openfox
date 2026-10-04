import { api, ensureProjects, launch, note, report, SHOTS, BASE } from './lib.js'

const fx = await ensureProjects()
const created = { status: 200, body: { project: { id: fx.writing } } }
const projectId = fx.writing
console.log('create writing project', created.status, projectId)
if (!projectId) {
  note(`writing project not created: ${JSON.stringify(created.body).slice(0, 200)}`)
  report()
  process.exit(0)
}
const rpc = (method: string, params: Record<string, unknown> = {}) =>
  api(`/api/plugins/openfox-writing/rpc/${method}`, { json: { params, projectId } })

// Codex: invalid slugs, traversal, unknown type, duplicates
for (const slug of ['Bad Slug', '../evil', 'a/b', '', '.hidden', 'ok-slug', 'ok-slug']) {
  const r = await rpc('codex.save', { type: 'characters', slug, title: 'T', tags: [], facts: {}, body: 'x' })
  console.log('codex.save', JSON.stringify(slug), r.status)
  if (slug === 'ok-slug' && r.status !== 200) note(`codex.save valid slug failed: ${r.status}`)
  if (slug !== 'ok-slug' && r.status === 200) note(`codex.save accepted slug ${JSON.stringify(slug)}`)
}
const bad = await rpc('codex.save', { type: '../x', slug: 'a', title: 'T', tags: [], facts: {}, body: '' })
if (bad.status === 200) note('codex.save accepted unknown type')
const tags = await rpc('codex.save', { type: 'lore', slug: 't1', title: 'T', tags: 'notarray', facts: 5, body: null })
console.log('codex.save weird types', tags.status, JSON.stringify(tags.body).slice(0, 150))

// Scenes: traversal and concurrent saves
for (const path of ['../../etc/passwd.md', 'manuscript/../AGENTS.md', 'manuscript/a/b/c.txt', '/etc/hosts']) {
  const r = await rpc('scene.save', { path, frontmatter: {}, body: 'x' })
  if (r.status === 200) note(`scene.save accepted ${path}`)
}
const scenePath = 'manuscript/act-1/ch-1/scene-1.md'
await rpc('scene.save', { path: scenePath, frontmatter: { title: 'S1' }, body: 'start' })
const bodies = Array.from({ length: 12 }, (_, i) => `version ${i} ` + 'lorem ipsum '.repeat(2000))
await Promise.all(bodies.map((b) => rpc('scene.save', { path: scenePath, frontmatter: { title: 'S1' }, body: b })))
const got = await rpc('scene.get', { path: scenePath })
const body = ((got.body as { result?: { body?: string } }).result?.body ?? '').trim()
console.log(
  'after concurrent saves, body matches one version:',
  bodies.some((b) => b.trim() === body),
  body.length,
)
if (!bodies.some((b) => b.trim() === body)) note('concurrent scene saves left a corrupted/mixed file')
const tree = await rpc('manuscript.tree')
console.log('tree', JSON.stringify(tree.body).slice(0, 200))

// UI
const { browser, page } = await launch('writing')
for (const path of [`/p/${projectId}`, `/p/${projectId}/codex`, `/p/${projectId}/manuscript`]) {
  await page.goto(`${BASE}${path}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(800)
  const text = (await page.locator('body').innerText()).replace(/\n+/g, ' | ')
  console.log(path.replace(projectId, ':id').padEnd(22), text.slice(0, 160))
  await page.screenshot({ path: `${SHOTS}/40-${path.split('/').pop()}.png` })
}
report()
await browser.close()
