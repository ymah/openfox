import { useState } from 'react'
import { Button } from '../shared/Button'
import { ConfirmModal } from '../shared/ConfirmModal'
import { DirectoryBrowser } from '../shared/DirectoryBrowser'
import { authFetch } from '../../lib/api'
import { useT } from '../../hooks/useT'

interface ImportResult {
  imported: string[]
  skipped: Array<{ name: string; reason: string }>
}

interface ImportFromFolderPanelProps {
  /** Button label, e.g. "Import skills from folder". */
  buttonLabel: string
  /** Confirmation dialog title, e.g. "Import skills?". */
  confirmTitle: string
  /** Confirmation dialog body — what will happen and any trust caveat. */
  confirmMessage: string
  /** e.g. "/api/skills/import-to-project" or "/api/instructions/import-to-project". */
  endpoint: string
  /** Label for one imported item in the result summary, e.g. "skill" / "instructions file". */
  itemLabel: string
  /** Called after a successful import (even a partial one) so the caller can refresh its list. */
  onImported?: () => void
}

/**
 * Shared "pick a local folder, confirm, import" flow — used for both project
 * skills (.openfox/skills/) and project instructions (.openfox/instructions/).
 * Reuses DirectoryBrowser (server-side path picker) exactly as the existing
 * global skills library selector does, but as a one-time import into this
 * project rather than a persistent pointer to an external path.
 */
export function ImportFromFolderPanel({
  buttonLabel,
  confirmTitle,
  confirmMessage,
  endpoint,
  itemLabel,
  onImported,
}: ImportFromFolderPanelProps) {
  const t = useT()
  const [choosing, setChoosing] = useState(false)
  const [pendingPath, setPendingPath] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)

  const runImport = async () => {
    if (!pendingPath || importing) return
    setImporting(true)
    setError('')
    try {
      const res = await authFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourcePath: pendingPath }),
      })
      const data = (await res.json()) as ImportResult & { error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Import failed.')
        return
      }
      setResult(data)
      onImported?.()
    } catch {
      setError('Import failed.')
    } finally {
      setImporting(false)
      setPendingPath(null)
    }
  }

  return (
    <div>
      <Button
        type="button"
        size="sm"
        onClick={() => {
          setError('')
          setResult(null)
          setChoosing(true)
        }}
      >
        {buttonLabel}
      </Button>

      {choosing && (
        <DirectoryBrowser
          onSelect={(path) => {
            setChoosing(false)
            setPendingPath(path)
          }}
          onClose={() => setChoosing(false)}
        />
      )}

      <ConfirmModal
        isOpen={pendingPath !== null}
        onClose={() => setPendingPath(null)}
        onConfirm={() => void runImport()}
        title={confirmTitle}
        message={confirmMessage}
        confirmLabel="Import"
        disabled={importing}
      />

      {error && <p className="mt-2 text-xs text-error">{error}</p>}

      {result && (
        <div className="mt-2 text-xs space-y-1">
          {result.imported.length > 0 && (
            <p className="text-text-primary">
              {t(
                {
                  en: { one: 'Imported {{count}} {{item}}', other: 'Imported {{count}} {{item}}s' },
                  fr: { one: '{{count}} {{item}} importé', other: '{{count}} {{item}}s importés' },
                },
                { count: result.imported.length, item: itemLabel },
              )}
              : {result.imported.join(', ')}
            </p>
          )}
          {result.skipped.length > 0 && (
            <ul className="text-text-muted list-disc list-inside">
              {result.skipped.map((s) => (
                <li key={s.name}>
                  {s.name}: {s.reason}
                </li>
              ))}
            </ul>
          )}
          {result.imported.length === 0 && result.skipped.length === 0 && (
            <p className="text-text-muted">
              {t(
                { en: 'No {{item}}s found in that folder.', fr: 'Aucun {{item}} trouvé dans ce dossier.' },
                { item: itemLabel },
              )}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
