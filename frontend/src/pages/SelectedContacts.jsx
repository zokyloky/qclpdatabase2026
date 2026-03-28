import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSelectedContacts, exportContacts } from '../api'

function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export default function SelectedContacts() {
  const navigate = useNavigate()
  const [contacts, setContacts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch]     = useState('')
  const [sortField, setSortField] = useState('firm')
  const [sortDir, setSortDir]   = useState('asc')

  const debouncedSearch = useDebounce(search)

  useEffect(() => {
    setLoading(true)
    getSelectedContacts()
      .then(setContacts)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  function toggleSort(field) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const filtered = useMemo(() => {
    let list = contacts
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase()
      list = list.filter(c =>
        (c.firm_name || '').toLowerCase().includes(q) ||
        (c.first_name + ' ' + c.last_name).toLowerCase().includes(q) ||
        (c.job_title || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q)
      )
    }
    return [...list].sort((a, b) => {
      let av, bv
      if (sortField === 'firm')  { av = (a.firm_name || '').toLowerCase(); bv = (b.firm_name || '').toLowerCase() }
      else if (sortField === 'name')  { av = (a.last_name || '').toLowerCase(); bv = (b.last_name || '').toLowerCase() }
      else if (sortField === 'title') { av = (a.job_title || '').toLowerCase(); bv = (b.job_title || '').toLowerCase() }
      else if (sortField === 'score') { av = a.filter_score ?? -1; bv = b.filter_score ?? -1 }
      else return 0
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [contacts, debouncedSearch, sortField, sortDir])

  // Group by firm for display
  const grouped = useMemo(() => {
    const map = new Map()
    for (const c of filtered) {
      if (!map.has(c.lp_firm_id)) map.set(c.lp_firm_id, { firm_name: c.firm_name, institution_type: c.institution_type, country: c.country, lp_firm_id: c.lp_firm_id, contacts: [] })
      map.get(c.lp_firm_id).contacts.push(c)
    }
    return Array.from(map.values())
  }, [filtered])

  async function handleExport() {
    setExporting(true)
    try { await exportContacts() } catch (e) { alert(e.message) }
    finally { setExporting(false) }
  }

  function SortHeader({ label, field }) {
    const active = sortField === field
    return (
      <button
        onClick={() => toggleSort(field)}
        className={`flex items-center gap-1 font-medium text-xs uppercase tracking-wide
          ${active ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
      >
        {label}
        <span className="text-gray-400">{active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
    )
  }

  return (
    <div className="space-y-4 max-w-6xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Selected Contacts</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading ? 'Loading…' : `${contacts.length} contacts shortlisted across ${new Set(contacts.map(c => c.lp_firm_id)).size} firms`}
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || contacts.length === 0}
          className="btn-secondary text-sm py-2 px-4 whitespace-nowrap disabled:opacity-40"
        >
          {exporting ? 'Exporting…' : '↓ Export CSV'}
        </button>
      </div>

      {/* Search */}
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
        <input
          type="search"
          placeholder="Search by firm, name, title, or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input text-sm w-full max-w-md"
        />
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">Loading…</div>
      ) : contacts.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-16 text-center">
          <div className="text-4xl mb-3">📋</div>
          <p className="font-medium text-gray-900">No contacts shortlisted yet.</p>
          <p className="text-sm text-gray-500 mt-1">Go to a firm and shortlist contacts to see them here.</p>
          <button
            onClick={() => navigate('/firms')}
            className="mt-4 btn-primary text-sm"
          >
            Browse firms →
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center">
          <p className="text-sm text-gray-400">No contacts match your search.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left">
                  <SortHeader label="Firm" field="firm" />
                </th>
                <th className="px-4 py-3 text-left">
                  <SortHeader label="Name" field="name" />
                </th>
                <th className="px-4 py-3 text-left">
                  <SortHeader label="Title" field="title" />
                </th>
                <th className="px-4 py-3 text-center w-10">Email</th>
                <th className="px-4 py-3 text-center w-10">LinkedIn</th>
                <th className="px-4 py-3 text-center">
                  <SortHeader label="Score" field="score" />
                </th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(group => (
                <>
                  {/* Firm group header */}
                  <tr key={`group-${group.lp_firm_id}`} className="bg-gray-50 border-b border-gray-100">
                    <td colSpan={7} className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => navigate(`/firms/${group.lp_firm_id}`)}
                          className="font-semibold text-sm text-blue-700 hover:text-blue-900 hover:underline"
                        >
                          {group.firm_name}
                        </button>
                        {group.institution_type && (
                          <span className="text-xs text-gray-400">· {group.institution_type}</span>
                        )}
                        {group.country && (
                          <span className="text-xs text-gray-400">· {group.country}</span>
                        )}
                        <span className="ml-auto text-xs text-blue-600 font-medium">
                          {group.contacts.length} shortlisted
                        </span>
                      </div>
                    </td>
                  </tr>
                  {/* Contact rows */}
                  {group.contacts.map(c => {
                    const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ')
                    return (
                      <tr key={c.id} className="border-b border-gray-50 hover:bg-blue-50 transition-colors">
                        <td className="px-4 py-2.5 text-gray-300">—</td>
                        <td className="px-4 py-2.5">
                          <span className="font-medium text-gray-900">{fullName || <span className="text-gray-400">—</span>}</span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs">
                          {c.job_title || <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {c.email
                            ? <a href={`mailto:${c.email}`} title={c.email}
                                 className="inline-flex items-center justify-center opacity-70 hover:opacity-100 transition-opacity">
                                <img src="/email.webp" alt="Email" className="w-5 h-5 object-contain" />
                              </a>
                            : <span className="text-gray-200">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {c.linkedin_url
                            ? <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer"
                                 className="inline-flex items-center justify-center opacity-70 hover:opacity-100 transition-opacity">
                                <img src="/linkedin.webp" alt="LinkedIn" className="w-5 h-5 object-contain" />
                              </a>
                            : <span className="text-gray-200">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {c.filter_score != null ? (
                            <span className={`text-sm font-semibold
                              ${c.filter_score >= 80 ? 'text-green-600'
                                : c.filter_score >= 60 ? 'text-yellow-600' : 'text-gray-500'}`}>
                              {c.filter_score}
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => navigate(`/firms/${c.lp_firm_id}`)}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                          >
                            View →
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </>
              ))}
            </tbody>
          </table>

          <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
            {filtered.length} contacts across {grouped.length} firms
            {debouncedSearch && ` · filtered from ${contacts.length} total`}
          </div>
        </div>
      )}
    </div>
  )
}
