// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProjectTypeToggle } from './ProjectTypeToggle'

afterEach(() => {
  cleanup()
})

describe('ProjectTypeToggle', () => {
  it('calls onChange with the clicked option', async () => {
    const onChange = vi.fn()
    render(<ProjectTypeToggle value="dev" onChange={onChange} />)

    await userEvent.click(screen.getByText('GTD'))
    expect(onChange).toHaveBeenCalledWith('gtd')
  })

  it('shows dev-specific help text when dev is selected', () => {
    render(<ProjectTypeToggle value="dev" onChange={vi.fn()} />)
    expect(screen.getByText('Classic OpenFox coding workflow.')).toBeTruthy()
  })

  it('shows GTD-specific help text when gtd is selected', () => {
    render(<ProjectTypeToggle value="gtd" onChange={vi.fn()} />)
    expect(screen.getByText(/This folder becomes a GTD vault/)).toBeTruthy()
  })
})
