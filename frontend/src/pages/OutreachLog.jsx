import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getOutreach, createOutreach, deleteOutreach, getFirms } from '../api'

export default function OutreachLog() {
  const navigate = useNavigate()

  const [data, setData]         = useState({ entries: [], total: 0 })
  const [page, setPage]         = useState(1)
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)

  const [form, setForm] = useState({
    firm_search: '', lp_firm_id: '', lp_contact_id: '',
    outreach_date: new Date().toISOString().slice(0, 10),
    outreach_type: 'email', notes: '', logged_by: '',
  })
  const [firmSuggestions, setFirmSuggestions]   = useState([])
  const [firmSearching, setFirmSearching]       = useState(false)
  const [saving, setSaving]                     = useState(false)

  const PER_PAGE = 50

  function load() {
    setLoading(true)
    getOutreach({ page, per_page: PER_PAGE })
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [page])

  async function searchFirms(q) {
    if (!q || q.length < 2) { setFirmSuggestions([]); return }
    setFirmSearching(true)
    try {
      const res = await getFirms({ search: q, per_page: 8 })
      setFirmSuggestions(res.firms || [])
    } finally {
      setFirmSearching(false)
    }
  }

  function selectFirm(firm) {
    setForm(f => ({ ...f, firm_search: firm.display_name || firm.lp_name, lp_firm_id: firm.id }))
    setFirmSuggestions([])
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.lp_firm_id) { alert('Please select a firm'); return }
    setSaving(true)
    try {
      await createOutreach({
        lp_firm_id:    form.lp_firm_id,
        lp_contact_id: form.lp_contact_id || null,
        outreach_date: form.outreach_date,
        outreach_type: form.outreach_type,
        notes:         form.notes,
        logged_by:     form.logged_by,
      })
      setForm(f => ({ ...f, firm_search: '', lp_firm_id: '', notes: '' }))
      setShowForm(false)
      load()
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this entry?')) return
    await deleteOutreach(id)
    load()
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PER_PAGE))

  const TYPE_COLORS = {
    email:   'bg-blue-100 text-blue-700',
    call:    'bg-purple-100 text-purple-700',
    meeting: 'bg-green-100 text-green-700',
    event:   'bg-orange-100 text-orange-700',
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Outreach Log</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {data.total} entries total
          </p>
        </div>
        <button onClick={() => setShowForm(f => !f)} className="btn-primary text-sm">
          {showForm ? 'Cancel' : '+ Log outreach'}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="card p-5">
          <h2 className="font-medium text-gray-900 mb-4">New outreach entry</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {/* Firm search */}
            <div className="col-span-2 relative">
              <label className="block text-xs font-medium text-gray-600 mb-1">Firm *</label>
              <input
                type="text"
                value={form.firm_search}
                onChange={e => { setForm(f => ({ ...f, firm_search: e.target.value, lp_firm_id: '' })); searchFirms(e.target.value) }}
                placeholder="Search for a firm…"
                className="input text-sm"
                autoComplete="off"
              />
              {firmSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-10 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                  {firmSuggestions.map(f => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => selectFirm(f)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                    >
                      <div className="font-medium text-gray-900">{f.display_name || f.lp_name}</div>
                      <div className="text-xs text-gray-500">{f.institution_type} · {f.country}</div>
                    </button>
                  ))}
                </div>
              )}
              {form.lp_firm_id && (
                <p className="text-xs text-green-600 mt-1">✓ Firm selected</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
              <input type="date" value={form.outreach_date}
                onChange={e => setForm(f => ({ ...f, outreach_date: e.target.value }))}
                className="input text-sm" required />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select value={form.outreach_type}
                onChange={e => setForm(f => ({ ...f, outreach_type: e.target.value }))}
                className="select w-full text-sm">
                <option value="email">Email</option>
                <option value="call">Call</option>
                <option value="meeting">Meeting</option>
                <option value="event">Event</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Logged by</label>
              <input type="text" value={form.logged_by}
                onChange={e => setForm(f => ({ ...f, logged_by: e.target.value }))}
                placeholder="Your name"
                className="input text-sm" />
            </div>

            <div className="col-span-full">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <input type="text" value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Brief notes on this outreach…"
                className="input text-sm" />
            </div>

            <div className="col-span-full flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary text-sm">
                Cancel
              </button>
              <button type="submit" disabled={saving || !form.lp_firm_id} className="btn-primary text-sm">
                {saving ? 'Saving…' : 'Save entry'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading…</div>
        ) : data.entries.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            No outreach entries yet. Log your first interaction above.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Firm</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Contact</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Notes</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">By</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map(entry => (
                <tr key={entry.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{entry.outreach_date}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[entry.outreach_type] || 'bg-gray-100 text-gray-600'}`}>
                      {entry.outreach_type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => navigate(`/firms/${entry.lp_firm_id}`)}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      {entry.display_name || entry.lp_name}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {entry.contact_name || <span className="text-gray-300">Firm-level</span>}
                    {entry.contact_title && <div className="text-xs text-gray-400">{entry.contact_title}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs">
                    <span className="truncate block">{entry.notes || <span className="text-gray-300">—</span>}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{entry.logged_by || '—'}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="text-gray-300 hover:text-red-500 transition-colors text-xs"
                    >✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!loading && data.total > PER_PAGE && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-600">
            <span>Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, data.total)} of {data.total}</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                className="btn-secondary py-1 px-3 disabled:opacity-40 text-sm">← Prev</button>
              <span className="px-2">{page} / {totalPages}</span>
              <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
                className="btn-secondary py-1 px-3 disabled:opacity-40 text-sm">Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
