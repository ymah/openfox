// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('wouter', () => ({
  Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))
vi.mock('../../hooks/useT', () => ({ useT: () => (s: { en: string }) => s.en }))

import { PageErrorBoundary } from './PageErrorBoundary'

let shouldThrow = true
function Bomb() {
  if (shouldThrow) throw new Error('boom in the editor')
  return <div>editor ready</div>
}

beforeEach(() => {
  shouldThrow = true
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('PageErrorBoundary', () => {
  it('renders its children when nothing fails', () => {
    shouldThrow = false
    render(
      <PageErrorBoundary>
        <Bomb />
      </PageErrorBoundary>,
    )
    expect(screen.getByText('editor ready')).toBeTruthy()
  })

  it('shows the error with a way home instead of unmounting everything', () => {
    render(
      <PageErrorBoundary>
        <Bomb />
      </PageErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText('boom in the editor')).toBeTruthy()
    expect(screen.getByRole('link').getAttribute('href')).toBe('/')
  })

  it('renders the children again after "Try again" once the cause is gone', () => {
    render(
      <PageErrorBoundary>
        <Bomb />
      </PageErrorBoundary>,
    )
    shouldThrow = false
    fireEvent.click(screen.getByText('Try again'))
    expect(screen.getByText('editor ready')).toBeTruthy()
  })

  it('clears the error when the reset key changes (navigating elsewhere)', () => {
    const { rerender } = render(
      <PageErrorBoundary resetKey="/p/1/codex">
        <Bomb />
      </PageErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeTruthy()
    shouldThrow = false
    rerender(
      <PageErrorBoundary resetKey="/p/1/manuscript">
        <Bomb />
      </PageErrorBoundary>,
    )
    expect(screen.getByText('editor ready')).toBeTruthy()
  })
})
