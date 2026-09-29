// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getManuscript, saveScene } from './vault-client'
import { ManuscriptView } from './ManuscriptView'

const mockNavigate = vi.fn()

vi.mock('wouter', () => ({
  useLocation: () => ['/p/p1/manuscript', mockNavigate],
}))

vi.mock('./vault-client', () => ({
  getManuscript: vi.fn(),
  saveScene: vi.fn(),
}))

const mockedGetManuscript = vi.mocked(getManuscript)
const mockedSaveScene = vi.mocked(saveScene)

describe('ManuscriptView', () => {
  beforeEach(() => {
    mockedGetManuscript.mockReset()
    mockedSaveScene.mockReset()
    mockedSaveScene.mockResolvedValue({ path: '' } as never)
    mockNavigate.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows an empty state when there are no acts yet', async () => {
    mockedGetManuscript.mockResolvedValue({ acts: [] })
    render(<ManuscriptView projectId="p1" />)

    await waitFor(() => expect(screen.getByText(/No acts yet/)).toBeTruthy())
  })

  it('renders the act/chapter/scene tree and navigates to the write view on click', async () => {
    mockedGetManuscript.mockResolvedValue({
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
    } as never)
    render(<ManuscriptView projectId="p1" />)

    await waitFor(() => expect(screen.getByText('Opening')).toBeTruthy())
    await userEvent.click(screen.getByText('Opening'))

    expect(mockNavigate).toHaveBeenCalledWith(
      `/p/p1/write?path=${encodeURIComponent('manuscript/01-act-one/01-chapter-one/01-scene.md')}`,
    )
  })

  it('creates a scene under a new act/chapter via the "+ New scene" form', async () => {
    mockedGetManuscript.mockResolvedValue({ acts: [] })
    render(<ManuscriptView projectId="p1" />)
    await waitFor(() => expect(mockedGetManuscript).toHaveBeenCalledTimes(1))

    await userEvent.click(screen.getByText('+ New scene'))
    await userEvent.type(screen.getByPlaceholderText('Act title'), 'Act One')
    await userEvent.type(screen.getByPlaceholderText('Chapter title'), 'Chapter One')
    await userEvent.click(screen.getByText('Create'))

    await waitFor(() => expect(mockedSaveScene).toHaveBeenCalled())
    expect(mockedSaveScene.mock.calls[0]?.[1]).toBe('manuscript/01-act-one/01-chapter-one/01-scene.md')
  })

  it('reuses an existing act/chapter and picks the next scene number instead of overwriting scene 1', async () => {
    mockedGetManuscript.mockResolvedValue({
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
    } as never)
    render(<ManuscriptView projectId="p1" />)
    await waitFor(() => expect(screen.getByText('Opening')).toBeTruthy())

    await userEvent.click(screen.getByText('+ New scene'))
    // Same titles as the existing act/chapter — must append to them, not fork new numbered folders.
    await userEvent.type(screen.getByPlaceholderText('Act title'), 'Act One')
    await userEvent.type(screen.getByPlaceholderText('Chapter title'), 'Chapter One')
    await userEvent.click(screen.getByText('Create'))

    await waitFor(() => expect(mockedSaveScene).toHaveBeenCalled())
    expect(mockedSaveScene.mock.calls[0]?.[1]).toBe('manuscript/01-act-one/01-chapter-one/02-scene.md')
  })
})
