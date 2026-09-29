/**
 * Model-generated HTML/SVG shown in a preview frame. The frame is the security
 * boundary: it is sandboxed WITHOUT `allow-same-origin` (so the page runs in an
 * opaque origin and can reach neither the app's storage, cookies, token nor its
 * local API) and carries a CSP that forbids every network request. Inline
 * scripts and styles are allowed so charts, small tools and animations work.
 */
export const ARTIFACT_SANDBOX = 'allow-scripts'

export const ARTIFACT_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'media-src data: blob:',
  'font-src data:',
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ')

const CSP_META = `<meta http-equiv="Content-Security-Policy" content="${ARTIFACT_CSP}">`

export type ArtifactLanguage = 'html' | 'svg'

export function isArtifactLanguage(language: string): language is ArtifactLanguage {
  return language === 'html' || language === 'svg'
}

/**
 * The `srcdoc` for a preview. The CSP meta comes first, so nothing in the
 * generated markup can precede it; a policy the content adds itself can only
 * tighten it further.
 */
export function buildArtifactDocument(language: ArtifactLanguage, code: string): string {
  const style = '<style>html,body{margin:0;padding:0}body{font-family:system-ui,sans-serif}</style>'
  if (language === 'svg') {
    return `<!doctype html><html><head><meta charset="utf-8">${CSP_META}${style}</head><body>${code}</body></html>`
  }
  return `<!doctype html><html><head><meta charset="utf-8">${CSP_META}</head><body>${code}</body></html>`
}

export function artifactFilename(language: ArtifactLanguage): string {
  return language === 'svg' ? 'artifact.svg' : 'artifact.html'
}

/** True when the page background is dark, so diagrams can pick a matching theme. */
export function prefersDarkSurface(): boolean {
  try {
    const color = getComputedStyle(document.body).backgroundColor
    const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color)
    if (!match) return true
    const [r, g, b] = [Number(match[1]), Number(match[2]), Number(match[3])]
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5
  } catch {
    return true
  }
}
