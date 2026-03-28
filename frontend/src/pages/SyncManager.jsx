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
            <div key={i} className="px-4 py-2 text-qgray-700">
              {item.full_name || item.preqin_contact_id || '—'}
              {item.job_title && <span className="text-qgray-400 ml-2">{item.job_title}</span>}
              {item.old_job_title && (
                <span className="text-qgray-400 ml-2">
                  "{item.old_job_title}" → "{item.new_job_title}"
                </span>
              )}
            </div>
          ))}
          {count > items.length && (
            <div className="px-4 py-2 text-qgray-400 italic">
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

  const [file, setFile]           = useState(null)
  const [uploading, setUploading] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [diff, setDiff]           = useState(null)
  const [committed, setCommitted] = useState(null)
  const [error, setError]         = useState('')
  const [history, setHistory]     = useState([])

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
    <div className="space-y-5 w-full max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold text-qgray-900">Sync Management</h1>
        <p className="text-sm text-qgray-500 mt-0.5">
          Upload a new Preqin contacts export to preview and commit quarterly changes.
        </p>
      </div>

      {/* Success banner */}
      {committed && (
        <div className="bg-qteal-50 border border-qteal-200 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <p className="font-semibold text-qteal-800">Sync committed successfully</p>
              <ul className="text-sm text-qteal-700 mt-1 space-y-0.5">
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
          <h2 className="font-medium text-qgray-900 mb-1">Step 1 — Upload Preqin export</h2>
          <p className="text-sm text-qgray-500 mb-4">
            Upload the contacts export from Preqin (xlsx or csv). This is the same file used in Phase 4.
          </p>

          <div
            onDragOver={e => e.preventDefault()}
            onDrop={handleFileDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
              ${file ? 'border-qnavy-300 bg-qnavy-50' : 'border-qgray-300 hover:border-qgray-400'}`}
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
                <p className="font-medium text-qnavy-700">📄 {file.name}</p>
                <p className="text-sm text-qgray-500 mt-1">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
            ) : (
              <div>
                <p className="text-qgray-500">Drag & drop your Preqin file here, or click to browse</p>
                <p className="text-xs text-qgray-400 mt-1">Accepts .xlsx or .csv</p>
              </div>
            )}
          </div>

          {error && (
            <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</p>
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
            <h2 className="font-medium text-qgray-900 mb-1">Step 2 — Review changes</h2>
            <p className="text-sm text-qgray-500 mb-4">
              File: <strong>{diff.filename}</strong>. Review the diff below before committing.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {[
                { label: 'New contacts',     value: diff.new_contacts,       className: 'text-qteal-700 bg-qteal-50'  },
                { label: 'Updated contacts', value: diff.updated_contacts,   className: 'text-qnavy-700 bg-qnavy-50'  },
                { label: 'Unchanged',        value: diff.unchanged_contacts, className: 'text-qgray-700 bg-qgray-100' },
                { label: 'To deactivate',    value: diff.removed_contacts,   className: 'text-red-700 bg-red-50'      },
              ].map(({ label, value, className }) => (
                <div key={label} className={`rounded-lg p-3 ${className}`}>
                  <div className="text-2xl font-bold">{value.toLocaleString()}</div>
                  <div className="text-xs font-medium mt-0.5 opacity-80">{label}</div>
                </div>
              ))}
            </div>

            {diff.unknown_firm_ids > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 mb-4">
                ⚠ <strong>{diff.unknown_firm_ids}</strong> contacts skipped — their Preqin firm IDs don't match any
                firm in the database. New firms must be added manually via a full re-migration.
              </div>
            )}

            <div className="space-y-2">
              <DiffSection title="New contacts" count={diff.new_contacts} items={diff.new_contacts_preview}
                color="border-qteal-200 bg-qteal-50 text-qteal-800" />
              <DiffSection title="Updated contacts (title or role changed)" count={diff.updated_contacts} items={diff.updated_contacts_preview}
                color="border-qnavy-200 bg-qnavy-50 text-qnavy-800" />
              <DiffSection title="Contacts to deactivate (not in new export)" count={diff.removed_contacts} items={diff.removed_contacts_preview}
                color="border-red-200 bg-red-50 text-red-800" />
            </div>

            {error && (
              <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</p>
            )}

            <div className="mt-5 flex gap-3">
              <button onClick={reset} className="btn-secondary text-sm">← Start over</button>
              <button onClick={handleCommit} disabled={committing} className="btn-primary text-sm">
                {committing ? 'Committing…' : 'Commit sync →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync history */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-qgray-100">
          <h2 className="font-medium text-qgray-900">Sync history</h2>
        </div>
        {history.length === 0 ? (
          <div className="text-center py-8 text-qgray-400 text-sm">No syncs recorded yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-qgray-50 border-b border-qgray-100">
                <th className="text-left px-4 py-2.5 font-semibold text-2xs uppercase tracking-wider text-qgray-500">Date</th>
                <th className="text-left px-4 py-2.5 font-semibold text-2xs uppercase tracking-wider text-qgray-500">File</th>
                <th className="text-center px-4 py-2.5 font-semibold text-2xs uppercase tracking-wider text-qgray-500">Added</th>
                <th className="text-center px-4 py-2.5 font-semibold text-2xs uppercase tracking-wider text-qgray-500">Updated</th>
                <th className="text-center px-4 py-2.5 font-semibold text-2xs uppercase tracking-wider text-qgray-500">Removed</th>
                <th className="text-left px-4 py-2.5 font-semibold text-2xs uppercase tracking-wider text-qgray-500">Notes</th>
              </tr>
            </thead>
            <tbody>
              {history.map(h => (
                <tr key={h.id} className="border-b border-qgray-50 hover:bg-qgray-50 transition-colors">
                  <td className="px-4 py-2.5 text-qgray-500 text-xs whitespace-nowrap">
                    {h.sync_date?.slice(0, 16).replace('T', ' ')}
                  </td>
                  <td className="px-4 py-2.5 text-qgray-700 text-xs">{h.preqin_export_filename || '—'}</td>
                  <td className="px-4 py-2.5 text-center text-qteal-700 font-semibold">{h.contacts_added ?? '—'}</td>
                  <td className="px-4 py-2.5 text-center text-qnavy-600 font-semibold">{h.contacts_updated ?? '—'}</td>
                  <td className="px-4 py-2.5 text-center text-red-500 font-semibold">{h.contacts_removed ?? '—'}</td>
                  <td className="px-4 py-2.5 text-qgray-500 text-xs">{h.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
