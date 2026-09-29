import { describe, expect, it } from 'vitest'
import { ARTIFACT_CSP, ARTIFACT_SANDBOX, artifactFilename, buildArtifactDocument, isArtifactLanguage } from './artifact'

describe('artifact preview document', () => {
  it('is sandboxed without same-origin and blocks all network access', () => {
    expect(ARTIFACT_SANDBOX).toBe('allow-scripts')
    expect(ARTIFACT_SANDBOX).not.toMatch(/same-origin|popups|top-navigation|forms|modals/)
    expect(ARTIFACT_CSP).toContain("default-src 'none'")
    expect(ARTIFACT_CSP).toContain("connect-src 'none'")
    expect(ARTIFACT_CSP).not.toMatch(/https?:|\*/)
  })

  it('puts the CSP before any generated content', () => {
    const doc = buildArtifactDocument('html', '<script>fetch("https://evil.example")</script>')
    expect(doc.indexOf('Content-Security-Policy')).toBeGreaterThan(-1)
    expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf('<script>'))
  })

  it('wraps SVG in a full document with the same policy', () => {
    const doc = buildArtifactDocument('svg', '<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    expect(doc).toContain('<svg')
    expect(doc).toContain(ARTIFACT_CSP)
  })

  it('recognises previewable languages only', () => {
    expect(isArtifactLanguage('html')).toBe(true)
    expect(isArtifactLanguage('svg')).toBe(true)
    expect(isArtifactLanguage('javascript')).toBe(false)
    expect(isArtifactLanguage('mermaid')).toBe(false)
  })

  it('names downloads by type', () => {
    expect(artifactFilename('html')).toBe('artifact.html')
    expect(artifactFilename('svg')).toBe('artifact.svg')
  })
})
