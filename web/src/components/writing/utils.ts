export function slugify(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Next available `NN-name` slug among siblings, one past the highest existing prefix. */
export function nextNumberedSlug(existingSlugs: string[], name: string): string {
  const maxNum = existingSlugs.reduce((max, s) => {
    const m = /^(\d+)-/.exec(s)
    return m ? Math.max(max, parseInt(m[1]!, 10)) : max
  }, 0)
  return `${pad2(maxNum + 1)}-${name}`
}

/** Find a sibling slug whose name (after its numeric prefix) matches this title, if any. */
export function findSlugByTitle(existingSlugs: string[], title: string): string | undefined {
  const target = slugify(title)
  return existingSlugs.find((s) => s.replace(/^\d+-/, '') === target)
}
