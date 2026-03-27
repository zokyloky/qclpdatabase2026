import { useState, useEffect, useRef } from 'react'
import { uploadSyncFile, commitSync, getSyncHistory } from '../api'

function DiffSection({ title, count, items, color }) {
  const [expanded, setExpanded] = useState(false)
  if (count === 0) return null
  return (
    <div className={`border rounded-lg overflow-hidden ${color}`}>
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 text-left font-medium text-sm"
      >
        <span>{title} <span className="font-semibold">({count})</span></span>
        <span>{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && items.length > 0 && (
        <div className="border-t divide-y text-xs bg-white">
          {items.map((item, i) => (
            <div key={i} className="px-4 py-2 text-gray-700">
              {item.full_name || item.preqin_contact_id || '—'}
              {item.job_title && <span className="text-gray-400 ml-2">{item.job_title}</span>}
              {item.old_job_title && (
                <span className="text-gray-400 ml-2">
                  "{item.old_job_title}" → "{item.new_job_title}"
                </span>
              )}
            </div>
          ))}
          {count > items.length && (
            <div className="px-4 py-2 text-gray-400 italic">
              …and {count - items.length} more
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function SyncManager() {
  const fileRef = useRef()

  const [file, setFile]         = useState(null)
  const [uploading, setUploading] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [diff, setDiff]         = useState(null)
  const [committed, setCommitted] = useState(null)
  const [error, setError]       = useState('')
  const [history, setHistory]   = useState([])

  useEffect(() => {
    getSyncHistory().then(setHistory).catch(console.error)
  }, [])

  function handleFileDrop(e) {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) setFile(f)
  }

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    setError('')
    setDiff(null)
    try {
      const result = await uploadSyncFile(file)
      setDiff(result)
    } catch (err) {
      setError('Upload failed: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleCommit() {
    if (!diff) return
    if (!confirm(
      `This will apply the following changes:\n` +
      `• ${diff.new_contacts} new contacts added\n` +
      `• ${diff.updated_contacts} contacts updated\n` +
      `• ${diff.removed_contacts} contacts deactivated\n\n` +
      `Are you sure?`
    )) return

    setCommitting(true)
    try {
      const result = await commitSync(diff.session_id)
      setCommitted(result)
      setDiff(null)
      setFile(null)
      // Refresh history
      getSyncHistory().then(setHistory).catch(console.error)
    } catch (err) {
      setError('Commit failed: ' + err.message)
    } finally {
      setCommitting(false)
    }
  }

  function reset() {
    setFile(null)
    setDiff(null)
    setCommitted(null)
    setError('')
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Sync Management</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Upload a new Preqin contacts export to preview and commit quarterly changes.
        </p>
      </div>

      {/* Success banner */}
      {committed && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <p className="font-semibold text-green-800">Sync committed successfully</p>
              <ul className="text-sm text-green-700 mt-1 space-y-0.5">
                <li>• {committed.contacts_added} new contacts added</li>
                <li>• {committed.contacts_updated} contacts updated</li>
                <li>• {committed.contacts_deactivated} contacts deactivated</li>
              </ul>
              <button onClick={reset} className="btn-secondary text-sm mt-3">
                Upload another file
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload step */}
      {!committed && !diff && (
        <div className="card p-6">
          <h2 className="font-semibold text-gray-900 mb-1">Step 1 — Upload Preqin export</h2>
          <p className="text-sm text-gray-500 mb-4">
            Upload the contacts export from Preqin (xlsx or csv). This is the same file used in Phase 4.
          </p>

          <div
            onDragOver={e => e.preventDefault()}
            onDrop={handleFileDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
              ${file ? 'border-blue-300 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}`}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={e => setFile(e.target.files[0])}
            />
            {file ? (
              <div>
                <p className="font-medium text-blue-700">📄 {file.name}</p>
                <p className="text-sm text-gray-500 mt-1">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
            ) : (
              <div>
                <p className="text-gray-500">Drag & drop your Preqin file here, or click to browse</p>
                <p className="text-xs text-gray-400 mt-1">Accepts .xlsx or .csv</p>
              </div>
            )}
          </div>

          {error && (
            <p className="mt-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          <div className="mt-4 flex gap-3">
            {file && (
              <button onClick={() => setFile(null)} className="btn-secondary text-sm">
                Clear
              </button>
            )}
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="btn-primary text-sm"
            >
              {uploading ? 'Analysing file…' : 'Preview changes'}
            </button>
          </div>
        </div>
      )}

      {/* Diff step */}
      {diff && !committed && (
        <div className="space-y-4">
          <div className="card p-6">
            <h2 className="font-semibold text-gray-900 mb-1">Step 2 — Review changes</h2>
            <p className="text-sm text-gray-500 mb-4">
              File: <strong>{diff.filename}</strong>. Review the diff below before committing.
            </p>

            {/* Summary stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {[
                { label: 'New contacts',     value: diff.new_contacts,       color: 'text-green-700 bg-green-50' },
                { label: 'Updated contacts', value: diff.updated_contacts,   color: 'text-blue-700 bg-blue-50'   },
                { label: 'Unchanged',        value: diff.unchanged_contacts, color: 'text-gray-700 bg-gray-50'   },
                { label: 'To deactivate',    value: diff.removed_contacts,   color: 'text-red-700 bg-red-50'     },
              ].map(({ label, value, color }) => (
                <div key={label} className={`rounded-lg p-3 ${color}`}>
                  <div className="text-2xl font-bold">{value.toLocaleString()}</div>
                  <div className="text-xs font-medium mt-0.5 opacity-80">{label}</div>
                </div>
              ))}
            </div>

            {diff.unknown_firm_ids > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-800 mb-4">
                ⚠️ <strong>{diff.unknown_firm_ids}</strong> contacts skipped — their Preqin firm IDs don't match any
                firm in the database. New firms must be added manually via a full re-migration.
              </div>
            )}

            <div className="space-y-2">
              <DiffSection
                title="New contacts"
                count={diff.new_contacts}
                items={diff.new_contacts_preview}
                color="border-green-200 bg-green-50 text-green-800"
              />
              <DiffSection
                title="Updated contacts (title or role changed)"
                count={diff.updated_contacts}
                items={diff.updated_contacts_preview}
                color="border-blue-200 bg-blue-50 text-blue-800"
              />
              <DiffSection
                title="Contacts to deactivate (not in new export)"
                count={diff.removed_contacts}
                items={diff.removed_contacts_preview}
                color="border-red-200 bg-red-50 text-red-800"
              />
            </div>

            {error && (
              <p className="mt-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            <div className="mt-5 flex gap-3">
              <button onClick={reset} className="btn-secondary text-sm">
                ← Start over
              </button>
              <button
                onClick={handleCommit}
                disabled={committing}
                className="btn-primary text-sm"
              >
                {committing ? 'Committing…' : 'Commit sync →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync history */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Sync history</h2>
        </div>
        {history.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">No syncs recorded yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2 font-medium text-gray-600">Date</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">File</th>
                <th className="text-center px-4 py-2 font-medium text-gray-600">Added</th>
                <th className="text-center px-4 py-2 font-medium text-gray-600">Updated</th>
                <th className="text-center px-4 py-2 font-medium text-gray-600">Removed</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Notes</th>
              </tr>
            </thead>
            <tbody>
              {history.map(h => (
                <tr key={h.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-500 text-xs whitespace-nowrap">
                    {h.sync_date?.slice(0, 16).replace('T', ' ')}
                  </td>
                  <td className="px-4 py-2 text-gray-700 text-xs">{h.preqin_export_filename || '—'}</td>
                  <td className="px-4 py-2 text-center text-green-600 font-medium">{h.contacts_added ?? '—'}</td>
                  <td className="px-4 py-2 text-center text-blue-600 font-medium">{h.contacts_updated ?? '—'}</td>
                  <td className="px-4 py-2 text-center text-red-500 font-medium">{h.contacts_removed ?? '—'}</td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{h.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
