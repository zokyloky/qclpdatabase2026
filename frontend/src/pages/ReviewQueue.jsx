import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPendingReview, updateContact, bulkUpdateContacts } from '../api'
import Breadcrumb from '../components/Breadcrumb'

// Normalise a URL so it has a proper protocol prefix
function normalizeUrl(url) {
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  return 'https://' + url
}

function LinkedInIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  )
}

export default function ReviewQueue() {
  const navigate = useNavigate()

  const [data, setData]           = useState({ contacts: [], total: 0, page: 1, pages: 1 })
  const [page, setPage]           = useState(1)
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState({})      // contactId → true/false
  const [removing, setRemoving]   = useState({})      // contactId → 'approved'|'rejected'
  const [flash, setFlash]         = useState(null)    // { name, action } for the toast
  // Multi-select
  const [selectedIds, setSelectedIds]   = useState(new Set())
  const [bulkWorking, setBulkWorking]   = useState(false)

  useEffect(() => {
    setLoading(true)
    getPendingReview({ page, per_page: 50 })
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [page])

  async function handleAction(contactId, newStatus) {
    setSaving(s => ({ ...s, [contactId]: newStatus }))
    try {
      await updateContact(contactId, { filter_status: newStatus })

      // Find the contact name for the toast
      const contact = data.contacts.find(c => c.id === contactId)
      const name = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') : 'Contact'

      // Trigger the exit animation
      setRemoving(r => ({ ...r, [contactId]: newStatus }))

      // Show toast
      setFlash({ name, action: newStatus === 'approved' ? 'approved' : 'rejected' })
      setTimeout(() => setFlash(null), 2500)

      // After animation completes, remove from list
      setTimeout(() => {
        setData(d => ({
          ...d,
          total: d.total - 1,
          contacts: d.contacts.filter(c => c.id !== contactId),
        }))
        setRemoving(r => { const n = { ...r }; delete n[contactId]; return n })
        setSaving(s => { const n = { ...s }; delete n[contactId]; return n })
      }, 450)
    } catch (err) {
      alert('Error: ' + err.message)
      setSaving(s => ({ ...s, [contactId]: false }))
    }
  }

  // ── Multi-select helpers ──────────────────────────────────────────────────────
  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const visibleIds = useMemo(() => data.contacts.map(c => c.id), [data.contacts])
  const allSelected  = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id))
  const someSelected = visibleIds.some(id => selectedIds.has(id))
  const selectedCount = visibleIds.filter(id => selectedIds.has(id)).length

  async function handleBulkAction(newStatus) {
    if (selectedCount === 0 || bulkWorking) return
    setBulkWorking(true)
    const ids = visibleIds.filter(id => selectedIds.has(id))
    try {
      await bulkUpdateContacts({ contact_ids: ids, filter_status: newStatus })
      const actionLabel = newStatus === 'approved' ? 'approved' : 'rejected'
      setFlash({ name: `${ids.length} contacts`, action: actionLabel })
      setTimeout(() => setFlash(null), 2500)
      // Animate out all selected rows, then remove them
      const removeMap = {}
      ids.forEach(id => { removeMap[id] = newStatus })
      setRemoving(r => ({ ...r, ...removeMap }))
      setTimeout(() => {
        setData(d => ({
          ...d,
          total: Math.max(0, d.total - ids.length),
          contacts: d.contacts.filter(c => !ids.includes(c.id)),
        }))
        setRemoving(r => {
          const n = { ...r }
          ids.forEach(id => delete n[id])
          return n
        })
      }, 450)
      setSelectedIds(new Set())
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setBulkWorking(false)
    }
  }

  return (
    <div className="space-y-4 w-full">
      <Breadcrumb items={[{ label: 'Review Queue' }]} />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display font-bold text-3xl text-qgray-900 tracking-tight">Review Queue</h1>
          <p className="text-sm text-qgray-500 mt-0.5">
            Contacts with no role tags in Preqin — approve or reject each one.
            {data.total > 0 && (
              <span className="ml-1 font-semibold text-amber-600">{data.total} remaining.</span>
            )}
          </p>
        </div>

        {/* Toast notification */}
        {flash && (
          <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium shadow-sm transition-all
            ${flash.action === 'approved'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'}`}>
            <span>{flash.action === 'approved' ? '✓' : '✕'}</span>
            <span>
              <span className="font-semibold">{flash.name}</span>
              {' '}{flash.action === 'approved' ? 'approved' : 'rejected'}
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center py-20 text-qgray-400">Loading…</div>
      ) : data.contacts.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-4xl mb-3">✅</div>
          <p className="font-medium text-qgray-900">Review queue is empty.</p>
          <p className="text-sm text-qgray-500 mt-1">All contacts have been classified.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          {/* Progress indicator at top */}
          <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 flex items-center gap-3">
            <span className="text-amber-500 text-sm">⚠</span>
            <span className="text-xs text-amber-700 font-medium">
              {data.total} contact{data.total !== 1 ? 's' : ''} awaiting review — approve to add to the available pool, reject to exclude permanently.
            </span>
          </div>

          {/* Bulk action bar */}
          {selectedCount > 0 && (
            <div className="px-4 py-2.5 bg-qnavy-800 text-white flex items-center gap-3 flex-wrap border-b border-qnavy-700">
              <span className="text-sm font-semibold">{selectedCount} selected</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleBulkAction('approved')}
                  disabled={bulkWorking}
                  className="text-xs px-3 py-1.5 rounded bg-qteal-600 hover:bg-qteal-500 text-white font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  ✓ Approve Selected
                </button>
                <button
                  onClick={() => handleBulkAction('blacklisted')}
                  disabled={bulkWorking}
                  className="text-xs px-3 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  ✕ Reject Selected
                </button>
              </div>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="ml-auto text-xs text-qnavy-300 hover:text-white transition-colors"
              >
                Clear selection
              </button>
            </div>
          )}

          <table className="w-full text-sm">
            <thead>
              <tr className="bg-qgray-50 border-b border-qgray-200">
                {/* Select-all checkbox */}
                <th className="px-3 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected && !allSelected }}
                    onChange={() => {
                      if (allSelected) {
                        setSelectedIds(prev => {
                          const next = new Set(prev)
                          visibleIds.forEach(id => next.delete(id))
                          return next
                        })
                      } else {
                        setSelectedIds(prev => {
                          const next = new Set(prev)
                          visibleIds.forEach(id => next.add(id))
                          return next
                        })
                      }
                    }}
                    title="Select / deselect all visible contacts"
                    className="w-3.5 h-3.5 rounded border-qgray-300 cursor-pointer accent-qgreen-700"
                  />
                </th>
                <th className="text-left px-4 py-3 font-semibold text-2xs uppercase tracking-wider text-qgray-500">Contact</th>
                <th className="text-left px-4 py-3 font-semibold text-2xs uppercase tracking-wider text-qgray-500">Job Title</th>
                <th className="text-left px-4 py-3 font-semibold text-2xs uppercase tracking-wider text-qgray-500">Firm & Location</th>
                <th className="text-left px-4 py-3 font-semibold text-2xs uppercase tracking-wider text-qgray-500">Email</th>
                <th className="text-center px-4 py-3 font-semibold text-2xs uppercase tracking-wider text-qgray-500 w-10">LI</th>
                <th className="px-4 py-3 font-semibold text-2xs uppercase tracking-wider text-qgray-500 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {data.contacts.map(c => {
                const name = [c.first_name, c.last_name].filter(Boolean).join(' ')
                const isSaving = saving[c.id]
                const isRemoving = removing[c.id]
                const isChecked = selectedIds.has(c.id)

                // Build location string: city, country, region/continent
                const locationParts = [c.city, c.country, c.region].filter(Boolean)
                // Deduplicate if city = country somehow
                const locationStr = [...new Set(locationParts)].join(' · ')

                return (
                  <tr
                    key={c.id}
                    className={`border-b transition-all duration-400
                      ${isRemoving === 'approved'
                        ? 'bg-green-50 opacity-0 scale-y-0 max-h-0'
                        : isRemoving === 'blacklisted'
                        ? 'bg-red-50 opacity-0 scale-y-0 max-h-0'
                        : isChecked
                        ? 'bg-blue-50 border-blue-100 opacity-100'
                        : 'border-qgray-100 opacity-100 hover:bg-qgray-50'}`}
                  >
                    {/* Checkbox */}
                    <td className="px-3 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelect(c.id)}
                        className="w-3.5 h-3.5 rounded border-qgray-300 cursor-pointer accent-qgreen-700"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-qgray-900">{name || <span className="text-qgray-400">Unknown</span>}</div>
                      {c.qa_flags && (
                        <div className="text-xs text-amber-600 mt-0.5">{c.qa_flags}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-qgray-600 max-w-xs">
                      {c.job_title || <span className="text-qgray-300">No title</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => navigate(`/firms/${c.lp_firm_id}`)}
                        className="text-qgreen-700 hover:text-qgreen-800 hover:underline text-left font-medium"
                      >
                        {c.display_name || c.lp_name}
                      </button>
                      <div className="text-xs text-qgray-400 mt-0.5">
                        {c.institution_type && <span>{c.institution_type}</span>}
                        {locationStr && (
                          <span>{c.institution_type ? ' · ' : ''}{locationStr}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-qgray-600 text-xs">
                      {c.email ? (
                        <a href={`mailto:${c.email}`} className="hover:text-qgreen-700">{c.email}</a>
                      ) : <span className="text-qgray-300">No email</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {c.linkedin_url ? (
                        <a href={normalizeUrl(c.linkedin_url)} target="_blank" rel="noopener noreferrer"
                           className="inline-flex items-center justify-center text-qgray-400 hover:text-[#0077B5] transition-colors">
                          <LinkedInIcon />
                        </a>
                      ) : <span className="text-qgray-200">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleAction(c.id, 'approved')}
                          disabled={!!isSaving}
                          className={`text-xs w-20 py-1.5 rounded font-medium transition-all disabled:opacity-50 whitespace-nowrap text-center
                            ${isSaving === 'approved'
                              ? 'bg-green-600 text-white scale-95'
                              : 'bg-qteal-600 hover:bg-qteal-700 text-white'}`}
                        >
                          {isSaving === 'approved' ? '✓ Done' : 'Approve'}
                        </button>
                        <button
                          onClick={() => handleAction(c.id, 'blacklisted')}
                          disabled={!!isSaving}
                          className={`text-xs w-16 py-1.5 rounded transition-all disabled:opacity-50 whitespace-nowrap text-center
                            ${isSaving === 'blacklisted'
                              ? 'bg-red-100 text-red-800 border border-red-300 scale-95'
                              : 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200'}`}
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Pagination */}
          {data.pages > 1 && (
            <div className="px-4 py-3 border-t border-qgray-100 bg-qgray-50 flex items-center justify-between text-sm text-qgray-600">
              <span>{data.total} contacts remaining</span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                  className="btn-secondary py-1 px-3 disabled:opacity-40 text-sm"
                >
                  ← Prev
                </button>
                <span className="text-xs">{page} / {data.pages}</span>
                <button
                  disabled={page === data.pages}
                  onClick={() => setPage(p => p + 1)}
                  className="btn-secondary py-1 px-3 disabled:opacity-40 text-sm"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
