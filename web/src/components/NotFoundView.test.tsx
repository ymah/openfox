// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('wouter', () => ({
  Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))
vi.mock('../hooks/useT', () => ({ useT: () => (s: { en: string }) => s.en }))

import { NotFoundView } from './NotFoundView'

afterEach(cleanup)

describe('NotFoundView', () => {
  it('says the project could not be found and leads back home', () => {
    render(<NotFoundView kind="project" />)
    expect(screen.getByText(/project could not be found/i)).toBeTruthy()
    expect(screen.getByRole('link').getAttribute('href')).toBe('/')
  })

  it('says an unknown page does not exist and leads back home', () => {
    render(<NotFoundView kind="page" />)
    expect(screen.getByText('This page does not exist.')).toBeTruthy()
    expect(screen.getByRole('link').getAttribute('href')).toBe('/')
  })
})
