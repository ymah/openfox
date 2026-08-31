// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToolCallPreparing } from './ToolCallPreparing'

const { filePreviewMock, diffViewMock } = vi.hoisted(() => ({
  filePreviewMock: vi.fn((_props: { content: string; filePath?: string }) => <div data-testid="file-preview" />),
  diffViewMock: vi.fn((_props: { oldString: string; newString: string; filePath?: string }) => (
    <div data-testid="diff-view" />
  )),
}))

vi.mock('./DiffView', () => ({
  FilePreview: (props: { content: string; filePath?: string }) => filePreviewMock(props),
  DiffView: (props: { oldString: string; newString: string; filePath?: string }) => diffViewMock(props),
}))

afterEach(cleanup)

describe('ToolCallPreparing remote execution', () => {
  it('frames remote SSH commands with purple border', () => {
    const { container } = render(<ToolCallPreparing name="run_command" arguments={'{"command":"ssh host'} />)

    expect(container.textContent).not.toContain('REMOTE')
    expect(container.firstElementChild?.className).toContain('border-text-thinking')
  })

  it('frames nested remote commands with purple border', () => {
    const { container } = render(
      <ToolCallPreparing name="run_command" arguments={JSON.stringify({ command: "bash -lc 'setsid ssh host'" })} />,
    )

    expect(container.textContent).not.toContain('REMOTE')
    expect(container.firstElementChild?.className).toContain('border-text-thinking')
  })

  it('does not mark local commands as remote', () => {
    const { container } = render(<ToolCallPreparing name="run_command" arguments={'{"command":"echo ssh"'} />)

    expect(container.textContent).not.toContain('REMOTE')
    expect(container.firstElementChild?.className).not.toContain('border-text-thinking')
  })
})

describe('ToolCallPreparing live file edit preview', () => {
  it('shows the path in the header as soon as it streams in, for write_file', () => {
    render(<ToolCallPreparing name="write_file" arguments={'{"path":"src/foo.ts","content":"export'} />)

    expect(screen.getByText('src/foo.ts')).toBeDefined()
  })

  it('shows the path in the header as soon as it streams in, for edit_file', () => {
    render(<ToolCallPreparing name="edit_file" arguments={'{"path":"src/foo.ts","old_string":"function'} />)

    expect(screen.getByText('src/foo.ts')).toBeDefined()
  })

  it('renders a live FilePreview once write_file content starts streaming', () => {
    render(
      <ToolCallPreparing name="write_file" arguments={'{"path":"src/foo.ts","content":"export function foo() {'} />,
    )

    expect(screen.getByTestId('file-preview')).toBeDefined()
    expect(filePreviewMock).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'export function foo() {', filePath: 'src/foo.ts' }),
    )
  })

  it('renders no body for write_file before content has started streaming', () => {
    render(<ToolCallPreparing name="write_file" arguments={'{"path":"src/foo.ts"'} />)

    expect(screen.queryByTestId('file-preview')).toBeNull()
  })

  it('shows only the old_string text while new_string has not started streaming, for edit_file', () => {
    render(<ToolCallPreparing name="edit_file" arguments={'{"path":"src/foo.ts","old_string":"function foo() {'} />)

    expect(screen.getByText('function foo() {')).toBeDefined()
    expect(screen.queryByTestId('diff-view')).toBeNull()
  })

  it('switches to a live DiffView once new_string starts streaming, for edit_file', () => {
    render(
      <ToolCallPreparing
        name="edit_file"
        arguments={'{"path":"src/foo.ts","old_string":"function foo() {","new_string":"function bar() {'}
      />,
    )

    expect(screen.getByTestId('diff-view')).toBeDefined()
    expect(diffViewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        oldString: 'function foo() {',
        newString: 'function bar() {',
        filePath: 'src/foo.ts',
      }),
    )
  })

  it('renders nothing extra for tools other than edit_file/write_file', () => {
    render(<ToolCallPreparing name="read_file" arguments={'{"path":"src/foo.ts"'} />)

    expect(screen.queryByTestId('file-preview')).toBeNull()
    expect(screen.queryByTestId('diff-view')).toBeNull()
  })
})
