// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'

const mermaidRender = vi.fn()
vi.mock('mermaid', () => ({
  default: { initialize: vi.fn(), render: (...args: unknown[]) => mermaidRender(...args) },
}))

import { Markdown } from './Markdown'

afterEach(() => {
  cleanup()
  mermaidRender.mockReset()
})

describe('Markdown — math', () => {
  it('renders inline and display math with KaTeX', () => {
    const html = renderToString(<Markdown content={'Euler: $e^{i\\pi}+1=0$\n\n$$\n\\frac{n(n+1)}{2}\n$$'} />)
    expect(html).toContain('class="katex"')
    expect(html).toContain('katex-display')
  })

  it('renders \\( \\) and \\[ \\] delimiters too', () => {
    const html = renderToString(<Markdown content={'so \\(x^2\\) and\n\n\\[a+b\\]'} />)
    expect(html.match(/class="katex"/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('does not turn prices into formulas', () => {
    const html = renderToString(<Markdown content="It costs $5 and $10 in total." />)
    expect(html).not.toContain('katex')
    expect(html).toContain('$5')
    expect(html).toContain('$10')
  })

  it('does not treat dollars inside code as math', () => {
    const html = renderToString(<Markdown content={'Run `echo $HOME` then:\n\n```bash\nx=$1; y=$2\n```'} />)
    expect(html).not.toContain('class="katex"')
  })

  it('shows invalid LaTeX instead of throwing', () => {
    expect(() => renderToString(<Markdown content={'$\\notacommand{$'} />)).not.toThrow()
  })
})

describe('Markdown — HTML/SVG artifacts', () => {
  const page = '```html\n<h1>Hello</h1><script>document.title="x"</script>\n```'

  it('offers a preview that runs in a sandbox without same-origin and with a no-network policy', () => {
    render(<Markdown content={page} />)
    expect(screen.queryByTestId('artifact-preview')).toBeNull()
    fireEvent.click(screen.getByTestId('artifact-toggle'))
    const frame = screen.getByTestId('artifact-preview') as HTMLIFrameElement
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts')
    expect(frame.getAttribute('srcdoc')).toContain("default-src 'none'")
    expect(frame.getAttribute('srcdoc')).toContain('<h1>Hello</h1>')
  })

  it('previews SVG too, and not ordinary code', () => {
    render(<Markdown content={'```svg\n<svg xmlns="http://www.w3.org/2000/svg"></svg>\n```'} />)
    expect(screen.getByTestId('artifact-toggle')).toBeTruthy()
    cleanup()
    render(<Markdown content={'```javascript\nconsole.log(1)\n```'} />)
    expect(screen.queryByTestId('artifact-toggle')).toBeNull()
  })

  it('waits for the closing fence while streaming', () => {
    render(<Markdown content={'```html\n<h1>Half'} isStreaming />)
    expect(screen.queryByTestId('artifact-toggle')).toBeNull()
    cleanup()
    render(<Markdown content={page} isStreaming />)
    expect(screen.getByTestId('artifact-toggle')).toBeTruthy()
  })
})

describe('Markdown — mermaid', () => {
  it('renders a diagram once the block is complete', async () => {
    mermaidRender.mockResolvedValue({ svg: '<svg data-x="ok"></svg>' })
    render(<Markdown content={'```mermaid\ngraph TD; A-->B\n```'} />)
    await waitFor(() => expect(screen.getByTestId('mermaid-diagram')).toBeTruthy())
    expect(mermaidRender).toHaveBeenCalledWith(expect.stringMatching(/^mermaid-/), 'graph TD; A-->B')
  })

  it('falls back to the source when the diagram is invalid', async () => {
    mermaidRender.mockRejectedValue(new Error('Parse error'))
    render(<Markdown content={'```mermaid\nnot a diagram\n```'} />)
    await waitFor(() => expect(screen.getByText(/could not be rendered/i)).toBeTruthy())
    expect(screen.getByText('not a diagram')).toBeTruthy()
  })

  it('does not render a diagram from a fence still open while streaming', () => {
    render(<Markdown content={'```mermaid\ngraph TD; A-->'} isStreaming />)
    expect(mermaidRender).not.toHaveBeenCalled()
  })
})
