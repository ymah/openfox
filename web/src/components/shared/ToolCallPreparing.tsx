import { memo } from 'react'
import { ToolIcon } from './ToolIcon'
import { formatMetadataKeyLabelLower } from '../../lib/metadata-keys'
import { detectRemoteCommand } from '../../lib/remote-execution'
import { extractGrowingJsonField } from '../../lib/extractPartialToolArgs'
import { DiffView, FilePreview } from './DiffView'

interface ToolCallPreparingProps {
  name: string
  arguments?: string
}

// Tool-specific descriptions for better UX
const toolDescriptions: Record<string, string> = {
  read_file: 'Reading file',
  write_file: 'Writing file',
  edit_file: 'Editing file',
  run_command: 'Running command',
  glob: 'Searching files',
  grep: 'Searching content',
  ask_user: 'Asking user',
  criterion: 'Managing criterion',
  session_metadata: 'Managing',
  todo_write: 'Updating tasks',
}

function getToolDescription(name: string, args?: string): string {
  const base = toolDescriptions[name]
  if (!base) return `Preparing ${name}`
  if (name === 'session_metadata' && args) {
    try {
      const parsed = JSON.parse(args)
      const key = parsed.key as string | undefined
      if (key) {
        const label = formatMetadataKeyLabelLower(key)
        return `${base} ${label}`
      }
    } catch {
      // ignore parse errors
    }
  }
  return base
}

function extractCommandFromArgs(args: string): string | null {
  try {
    const cleaned = args.replace(/\s*\}\s*$/, '')
    const parsed = JSON.parse(cleaned)
    if (typeof parsed.command === 'string') return parsed.command
  } catch {
    const match = args.match(/"command"\s*:\s*"([^"]*)/)
    if (match && match[1]) return match[1]
  }
  return null
}

/**
 * Live body for edit_file/write_file while the tool call is still being
 * prepared — reuses the same DiffView/FilePreview used for a finished call,
 * fed with the growing partial content, so an edit is visible as it's
 * written instead of only appearing once the whole call has completed.
 */
function EditPreparingBody({ name, args, path }: { name: string; args: string; path: string | null }) {
  if (name === 'write_file') {
    const content = extractGrowingJsonField(args, 'content')
    if (!content) return null
    return (
      <div className="border-t border-border">
        <FilePreview content={content} filePath={path ?? undefined} />
      </div>
    )
  }

  if (name === 'edit_file') {
    const oldString = extractGrowingJsonField(args, 'old_string')
    if (!oldString) return null
    const newString = extractGrowingJsonField(args, 'new_string')
    if (newString === null) {
      // new_string hasn't started streaming yet — nothing to diff against,
      // show the text being matched so there's still something to see.
      return (
        <div className="border-t border-border p-2 text-xs font-mono text-text-muted whitespace-pre-wrap break-all">
          {oldString}
        </div>
      )
    }
    return (
      <div className="border-t border-border">
        <DiffView oldString={oldString} newString={newString} filePath={path ?? undefined} />
      </div>
    )
  }

  return null
}

export const ToolCallPreparing = memo(function ToolCallPreparing({ name, arguments: args }: ToolCallPreparingProps) {
  const description = getToolDescription(name, args)

  let detailText = description + '...'
  let remoteProtocol = null
  if (name === 'run_command' && args) {
    const command = extractCommandFromArgs(args)
    if (command) {
      detailText = command
      remoteProtocol = detectRemoteCommand(command)
    }
  }

  const isFileEdit = name === 'edit_file' || name === 'write_file'
  const path = isFileEdit && args ? extractGrowingJsonField(args, 'path') : null
  if (path) detailText = path

  return (
    <div
      className={`border rounded overflow-hidden my-1 min-w-0 ${remoteProtocol ? 'border-text-thinking/60 shadow-[0_0_0_1px_rgb(var(--color-text-thinking)_/_0.12)]' : 'border-border'}`}
    >
      <div className={`flex items-center gap-1.5 p-2 ${remoteProtocol ? 'bg-text-thinking/10' : 'bg-bg-tertiary'}`}>
        <span className="text-accent-warning animate-pulse">...</span>
        <ToolIcon tool={name} />
        <span className="font-mono text-accent-primary text-sm">{name}</span>
        {name === 'run_command' && args ? (
          <code className="text-text-muted text-xs flex-1 truncate">{detailText}</code>
        ) : (
          <span className="text-text-muted text-xs flex-1">{detailText}</span>
        )}
      </div>
      {isFileEdit && args && <EditPreparingBody name={name} args={args} path={path} />}
    </div>
  )
})
