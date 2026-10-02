// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const state: { type: string | undefined; enabled: string[]; location: string } = {
  type: 'writing',
  enabled: ['openfox-writing', 'openfox-chat'],
  location: '/p/p1',
}

vi.mock('wouter', () => ({
  Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
  useLocation: () => [state.location],
}))
vi.mock('../../hooks/useT', () => ({ useT: () => (s: { en: string }) => s.en }))
vi.mock('../../hooks/useCurrentProject', () => ({
  useCurrentProject: () => (state.type ? { id: 'p1', type: state.type } : undefined),
}))
vi.mock('../../hooks/usePlugins', () => ({
  usePlugins: () => ({ plugins: state.enabled.map((id) => ({ id, enabled: true })) }),
}))

import { PluginNavLinks } from './PluginNavLinks'

afterEach(() => {
  cleanup()
  state.type = 'writing'
  state.enabled = ['openfox-writing', 'openfox-chat']
  state.location = '/p/p1'
})

describe('PluginNavLinks', () => {
  it('links a book project to its Manuscript and Codex pages', () => {
    render(<PluginNavLinks projectId="p1" />)
    expect(screen.getByText('Manuscript').getAttribute('href')).toBe('/p/p1/manuscript')
    expect(screen.getByText('Codex').getAttribute('href')).toBe('/p/p1/codex')
  })

  it('links a chat project to its Memory page', () => {
    state.type = 'chat'
    render(<PluginNavLinks projectId="p1" />)
    expect(screen.getByText('Memory').getAttribute('href')).toBe('/p/p1/memory')
    expect(screen.queryByText('Codex')).toBeNull()
  })

  it('highlights the page you are on', () => {
    state.location = '/p/p1/codex'
    render(<PluginNavLinks projectId="p1" />)
    expect(screen.getByText('Codex').className).toContain('bg-accent-primary')
    expect(screen.getByText('Manuscript').className).not.toContain('bg-accent-primary')
  })

  it('shows nothing for a dev project, or when the owning plugin is disabled', () => {
    state.type = 'dev'
    const { container, rerender } = render(<PluginNavLinks projectId="p1" />)
    expect(container.textContent).toBe('')

    state.type = 'writing'
    state.enabled = ['openfox-chat']
    rerender(<PluginNavLinks projectId="p1" />)
    expect(container.textContent).toBe('')
  })
})
