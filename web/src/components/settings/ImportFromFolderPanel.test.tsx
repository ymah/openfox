// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImportFromFolderPanel } from './ImportFromFolderPanel'
import { authFetch } from '../../lib/api'

vi.mock('../../lib/api', () => ({
  authFetch: vi.fn(),
}))

vi.mock('../shared/DirectoryBrowser', () => ({
  DirectoryBrowser: ({ onSelect }: { onSelect: (path: string) => void }) => (
    <button onClick={() => onSelect('/Users/test/external-skills')}>Select mocked folder</button>
  ),
}))

function renderPanel() {
  return render(
    <ImportFromFolderPanel
      buttonLabel="Import skills from folder"
      confirmTitle="Import skills?"
      confirmMessage="Skills may contain instructions and scripts."
      endpoint="/api/skills/import-to-project"
      itemLabel="skill"
    />,
  )
}

async function pickAndConfirm() {
  fireEvent.click(screen.getByRole('button', { name: 'Import skills from folder' }))
  fireEvent.click(screen.getByRole('button', { name: 'Select mocked folder' }))
  fireEvent.click(screen.getByRole('button', { name: 'Import' }))
}

afterEach(() => {
  vi.mocked(authFetch).mockReset()
})

describe('ImportFromFolderPanel', () => {
  it('posts the selected folder path to the endpoint after confirmation', async () => {
    vi.mocked(authFetch).mockResolvedValue(
      new Response(JSON.stringify({ imported: ['foo-skill'], skipped: [] }), { status: 200 }),
    )

    renderPanel()
    await pickAndConfirm()

    await waitFor(() => {
      expect(authFetch).toHaveBeenCalledWith(
        '/api/skills/import-to-project',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ sourcePath: '/Users/test/external-skills' }),
        }),
      )
    })
  })

  it('shows the imported items on success', async () => {
    vi.mocked(authFetch).mockResolvedValue(
      new Response(JSON.stringify({ imported: ['foo-skill', 'bar-skill'], skipped: [] }), { status: 200 }),
    )

    renderPanel()
    await pickAndConfirm()

    expect(await screen.findByText(/Imported 2 skills: foo-skill, bar-skill/)).toBeTruthy()
  })

  it('shows skipped items with their reason', async () => {
    vi.mocked(authFetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          imported: [],
          skipped: [{ name: 'bad-skill', reason: 'SKILL.md is missing a "description" field' }],
        }),
        { status: 200 },
      ),
    )

    renderPanel()
    await pickAndConfirm()

    expect(await screen.findByText(/bad-skill: SKILL.md is missing a "description" field/)).toBeTruthy()
  })

  it('shows a server error message instead of a result on failure', async () => {
    vi.mocked(authFetch).mockResolvedValue(
      new Response(JSON.stringify({ error: 'Selected path is not a directory' }), { status: 400 }),
    )

    renderPanel()
    await pickAndConfirm()

    expect(await screen.findByText('Selected path is not a directory')).toBeTruthy()
    expect(screen.queryByText(/Imported/)).toBeNull()
  })

  it('does not call the endpoint until the confirmation dialog is accepted', () => {
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: 'Import skills from folder' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select mocked folder' }))

    expect(authFetch).not.toHaveBeenCalled()
    expect(screen.getByText('Import skills?')).toBeTruthy()
  })
})
