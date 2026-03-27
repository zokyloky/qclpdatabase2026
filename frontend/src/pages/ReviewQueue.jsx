import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPendingReview, updateContact } from '../api'

export default function ReviewQueue() {
  const navigate = useNavigate()

  const [data, setData]       = useState({ contacts: [], total: 0, page: 1, pages: 1 })
  const [page, setPage]       = useState(1)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState({})   // contactId → true/false

  useEffect(() => {
    setLoading(true)
    getPendingReview({ page, per_page: 50 })
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [page])

  async function handleAction(contactId, newStatus) {
    setSaving(s => ({ ...s, [contactId]: true }))
    try {
      await updateContact(contactId, { filter_status: newStatus })
      setData(d => ({
        ...d,
        total: d.total - 1,
        contacts: d.contacts.filter(c => c.id !== contactId),
      }))
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(s => ({ ...s, [contactId]: false }))
    }
  }

  async function handleBulkApprove(ids) {
    for (const id of ids) await handleAction(id, 'approved')
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Review Queue</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Contacts with no role tags in Preqin — classify each as Approved or Blacklisted.
          {data.total > 0 && ` ${data.total} remaining.`}
        </p>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">Loading…</div>
      ) : data.contacts.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-4xl mb-3">✅</div>
          <p className="font-medium text-gray-900">Review queue is empty.</p>
          <p className="text-sm text-gray-500 mt-1">All contacts have been classified.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Contact</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Job title</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Firm</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {data.contacts.map(c => {
                const name = [c.first_name, c.last_name].filter(Boolean).join(' ')
                const isSaving = saving[c.id]
                return (
                  <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{name || <span className="text-gray-400">Unknown</span>}</div>
                      {c.qa_flags && (
                        <div className="text-xs text-orange-500 mt-0.5">{c.qa_flags}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs">
                      {c.job_title || <span className="text-gray-300">No title</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => navigate(`/firms/${c.lp_firm_id}`)}
                        className="text-blue-600 hover:underline text-left"
                      >
                        {c.display_name || c.lp_name}
                      </button>
                      <div className="text-xs text-gray-400">{c.institution_type} · {c.country}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {c.email ? (
                        <a href={`mailto:${c.email}`} className="hover:text-blue-600">{c.email}</a>
                      ) : <span className="text-gray-300">No email</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleAction(c.id, 'approved')}
                          disabled={isSaving}
                          className="text-xs px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded transition-colors disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleAction(c.id, 'blacklisted')}
                          disabled={isSaving}
                          className="text-xs px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded transition-colors disabled:opacity-50"
                        >
                          Blacklist
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
            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-600">
              <span>{data.total} contacts remaining</span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                  className="btn-secondary py-1 px-3 disabled:opacity-40 text-sm"
                >
                  ← Prev
                </button>
                <span>{page} / {data.pages}</span>
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
