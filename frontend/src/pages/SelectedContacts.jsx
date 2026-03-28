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

// Inline icon components
function EmailIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M2 7l10 7 10-7" />
    </svg>
  )
}

function LinkedInIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  )
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
      if (!map.has(c.lp_firm_id)) map.set(c.lp_firm_id, {
        firm_name: c.firm_name, institution_type: c.institution_type,
        country: c.country, lp_firm_id: c.lp_firm_id, contacts: []
      })
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
        className={`flex items-center gap-1 font-semibold text-2xs uppercase tracking-wider transition-colors
          ${active ? 'text-qgreen-800' : 'text-qgray-500 hover:text-qgray-700'}`}
      >
        {label}
        <span className="text-qgray-400">{active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
    )
  }

  const firmCount = new Set(contacts.map(c => c.lp_firm_id)).size

  return (
    <div className="space-y-4 w-full">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display font-bold text-3xl text-qgray-900 tracking-tight">Selected Contacts</h1>
          <p className="text-sm text-qgray-500 mt-0.5">
            {loading ? 'Loading…' : `${contacts.length} contact${contacts.length !== 1 ? 's' : ''} shortlisted across ${firmCount} firm${firmCount !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || contacts.length === 0}
          className="btn-secondary disabled:opacity-40"
        >
          {exporting ? 'Exporting…' : '↓ Export CSV'}
        </button>
      </div>

      {/* Search */}
      <div className="filter-bar">
        <input
          type="search"
          placeholder="Search by firm, name, title, or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input text-sm w-full max-w-md"
        />
      </div>

      {loading ? (
        <div className="text-center py-20 text-qgray-400">Loading…</div>
      ) : contacts.length === 0 ? (
        <div className="card p-16 text-center">
          <div className="text-4xl mb-3">📋</div>
          <p className="font-medium text-qgray-900">No contacts shortlisted yet.</p>
          <p className="text-sm text-qgray-500 mt-1">Go to a firm and shortlist contacts to see them here.</p>
          <button onClick={() => navigate('/firms')} className="mt-4 btn-primary text-sm">
            Browse firms →
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-sm text-qgray-400">No contacts match your search.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-qgray-50 border-b border-qgray-200">
                <th className="px-4 py-3 text-left"><SortHeader label="Firm" field="firm" /></th>
                <th className="px-4 py-3 text-left"><SortHeader label="Name" field="name" /></th>
                <th className="px-4 py-3 text-left"><SortHeader label="Title" field="title" /></th>
                <th className="px-4 py-3 text-center w-12">
                  <span className="font-semibold text-2xs uppercase tracking-wider text-qgray-500">Email</span>
                </th>
                <th className="px-4 py-3 text-center w-12">
                  <span className="font-semibold text-2xs uppercase tracking-wider text-qgray-500">LinkedIn</span>
                </th>
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
                  <tr key={`group-${group.lp_firm_id}`} className="bg-qgreen-50 border-b border-qgreen-100">
                    <td colSpan={7} className="px-4 py-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => navigate(`/firms/${group.lp_firm_id}`)}
                          className="font-semibold text-sm text-qgreen-800 hover:text-qgreen-600 hover:underline"
                        >
                          {group.firm_name}
                        </button>
                        {group.institution_type && (
                          <span className="text-xs text-qgray-400">· {group.institution_type}</span>
                        )}
                        {group.country && (
                          <span className="text-xs text-qgray-400">· {group.country}</span>
                        )}
                        <span className="ml-auto text-xs text-qgreen-700 font-semibold">
                          {group.contacts.length} shortlisted
                        </span>
                      </div>
                    </td>
                  </tr>
                  {/* Contact rows */}
                  {group.contacts.map(c => {
                    const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ')
                    const isDynamo = c.source === 'dynamo'
                    return (
                      <tr key={c.id} className="border-b border-qgray-50 hover:bg-qgray-50 transition-colors">
                        <td className="px-4 py-2.5">
                          {isDynamo && (
                            <span className="inline-flex px-1.5 py-0.5 rounded text-2xs font-medium bg-purple-50 text-purple-700 border border-purple-100">D</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="font-medium text-qgray-900">{fullName || <span className="text-qgray-400">—</span>}</span>
                        </td>
                        <td className="px-4 py-2.5 text-qgray-500 text-xs">
                          {c.job_title || <span className="text-qgray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {c.email
                            ? <a href={`mailto:${c.email}`} title={c.email}
                                 className="inline-flex items-center justify-center text-qgray-400 hover:text-qgreen-700 transition-colors">
                                <EmailIcon />
                              </a>
                            : <span className="text-qgray-200">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {c.linkedin_url
                            ? <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer"
                                 className="inline-flex items-center justify-center text-qgray-400 hover:text-[#0077B5] transition-colors">
                                <LinkedInIcon />
                              </a>
                            : <span className="text-qgray-200">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {c.filter_score != null ? (
                            <span className={`text-sm font-semibold
                              ${c.filter_score >= 80 ? 'text-qteal-700'
                                : c.filter_score >= 60 ? 'text-amber-600' : 'text-qgray-500'}`}>
                              {c.filter_score}
                            </span>
                          ) : <span className="text-qgray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => navigate(`/firms/${c.lp_firm_id}`)}
                            className="text-xs text-qgreen-700 hover:text-qgreen-800 font-medium"
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

          <div className="px-4 py-3 border-t border-qgray-100 bg-qgray-50 text-xs text-qgray-400">
            {filtered.length} contact{filtered.length !== 1 ? 's' : ''} across {grouped.length} firm{grouped.length !== 1 ? 's' : ''}
            {debouncedSearch && ` · filtered from ${contacts.length} total`}
          </div>
        </div>
      )}
    </div>
  )
}
