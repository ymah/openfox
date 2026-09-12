// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { authFetch } from '../../lib/api'
import { ManuscriptView } from './ManuscriptView'

const mockNavigate = vi.fn()

vi.mock('wouter', () => ({
  useLocation: () => ['/p/p1/manuscript', mockNavigate],
}))

vi.mock('../../lib/api', () => ({
  authFetch: vi.fn(),
}))

const mockedAuthFetch = vi.mocked(authFetch)

function jsonResponse(data: unknown): Response {
  return { ok: true, json: () => Promise.resolve(data) } as Response
}

describe('ManuscriptView', () => {
  beforeEach(() => {
    mockedAuthFetch.mockReset()
    mockNavigate.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows an empty state when there are no acts yet', async () => {
    mockedAuthFetch.mockResolvedValue(jsonResponse({ acts: [] }))
    render(<ManuscriptView projectId="p1" />)

    await waitFor(() => expect(screen.getByText(/No acts yet/)).toBeTruthy())
  })

  it('renders the act/chapter/scene tree and navigates to the write view on click', async () => {
    mockedAuthFetch.mockResolvedValue(
      jsonResponse({
        acts: [
          {
            slug: '01-act-one',
            title: 'act one',
            chapters: [
              {
                slug: '01-chapter-one',
                title: 'chapter one',
                scenes: [
                  {
                    slug: '01-scene',
                    path: 'manuscript/01-act-one/01-chapter-one/01-scene.md',
                    title: 'Opening',
                    status: 'draft',
                  },
                ],
              },
            ],
          },
        ],
      }),
    )
    render(<ManuscriptView projectId="p1" />)

    await waitFor(() => expect(screen.getByText('Opening')).toBeTruthy())
    await userEvent.click(screen.getByText('Opening'))

    expect(mockNavigate).toHaveBeenCalledWith(
      `/p/p1/write?path=${encodeURIComponent('manuscript/01-act-one/01-chapter-one/01-scene.md')}`,
    )
  })

  it('creates a scene under a new act/chapter via the "+ New scene" form', async () => {
    mockedAuthFetch.mockResolvedValue(jsonResponse({ acts: [] }))
    render(<ManuscriptView projectId="p1" />)
    await waitFor(() => expect(mockedAuthFetch).toHaveBeenCalledTimes(1))

    await userEvent.click(screen.getByText('+ New scene'))
    await userEvent.type(screen.getByPlaceholderText('Act title'), 'Act One')
    await userEvent.type(screen.getByPlaceholderText('Chapter title'), 'Chapter One')
    await userEvent.click(screen.getByText('Create'))

    await waitFor(() =>
      expect(mockedAuthFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/projects/p1/manuscript/scene?path='),
        expect.objectContaining({ method: 'PUT' }),
      ),
    )
    const putCall = mockedAuthFetch.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'PUT')
    expect(putCall?.[0]).toContain(encodeURIComponent('manuscript/01-act-one/01-chapter-one/01-scene.md'))
  })

  it('reuses an existing act/chapter and picks the next scene number instead of overwriting scene 1', async () => {
    mockedAuthFetch.mockResolvedValue(
      jsonResponse({
        acts: [
          {
            slug: '01-act-one',
            title: 'act one',
            chapters: [
              {
                slug: '01-chapter-one',
                title: 'chapter one',
                scenes: [
                  { slug: '01-scene', path: 'manuscript/01-act-one/01-chapter-one/01-scene.md', title: 'Opening' },
                ],
              },
            ],
          },
        ],
      }),
    )
    render(<ManuscriptView projectId="p1" />)
    await waitFor(() => expect(screen.getByText('Opening')).toBeTruthy())

    await userEvent.click(screen.getByText('+ New scene'))
    // Same titles as the existing act/chapter — must append to them, not fork new numbered folders.
    await userEvent.type(screen.getByPlaceholderText('Act title'), 'Act One')
    await userEvent.type(screen.getByPlaceholderText('Chapter title'), 'Chapter One')
    await userEvent.click(screen.getByText('Create'))

    await waitFor(() => {
      const putCall = mockedAuthFetch.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'PUT')
      expect(putCall).toBeTruthy()
    })
    const putCall = mockedAuthFetch.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'PUT')
    expect(putCall?.[0]).toContain(encodeURIComponent('manuscript/01-act-one/01-chapter-one/02-scene.md'))
  })
})
