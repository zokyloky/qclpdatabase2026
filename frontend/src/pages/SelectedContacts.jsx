import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSelectedContacts, exportContacts, updateContact } from '../api'
import Breadcrumb from '../components/Breadcrumb'

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

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export default function SelectedContacts() {
  const navigate = useNavigate()
  const [contacts, setContacts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch]     = useState('')
  const [sortField, setSortField] = useState('firm')
  const [sortDir, setSortDir]   = useState('asc')
  const [activeLetter, setActiveLetter] = useState(null)

  const debouncedSearch = useDebounce(search)

  // Refs for each firm-group section by first letter
  const letterRefs = useRef({})
  const contentRef = useRef(null)

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

  // Build a set of letters that have at least one firm
  const lettersWithFirms = useMemo(() => {
    const set = new Set()
    for (const group of grouped) {
      const first = (group.firm_name || '').trim().toUpperCase()[0]
      if (first) set.add(first)
    }
    return set
  }, [grouped])

  // Group firms by first letter for the sidebar jump targets
  const groupedByLetter = useMemo(() => {
    const map = new Map()
    for (const group of grouped) {
      const first = (group.firm_name || '').trim().toUpperCase()[0] || '#'
      if (!map.has(first)) map.set(first, [])
      map.get(first).push(group)
    }
    return map
  }, [grouped])

  // Track which letter is currently in view via IntersectionObserver
  useEffect(() => {
    if (loading) return
    const observers = []
    const visibleLetters = new Set()

    ALPHABET.forEach(letter => {
      const el = letterRefs.current[letter]
      if (!el) return
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            visibleLetters.add(letter)
          } else {
            visibleLetters.delete(letter)
          }
          // Set active to the first visible letter alphabetically
          if (visibleLetters.size > 0) {
            setActiveLetter([...visibleLetters].sort()[0])
          }
        },
        { root: null, threshold: 0.1 }
      )
      obs.observe(el)
      observers.push(obs)
    })

    return () => observers.forEach(o => o.disconnect())
  }, [loading, grouped])

  function scrollToLetter(letter) {
    const el = letterRefs.current[letter]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  async function handleExport() {
    setExporting(true)
    try { await exportContacts() } catch (e) { alert(e.message) }
    finally { setExporting(false) }
  }

  async function handleRemove(contactId) {
    setContacts(cs => cs.filter(c => c.id !== contactId))
    try {
      await updateContact(contactId, { is_selected: 0 })
    } catch (e) {
      getSelectedContacts().then(setContacts).catch(console.error)
      alert('Failed to remove contact: ' + e.message)
    }
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

      <Breadcrumb items={[{ label: 'Selected Contacts' }]} />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display font-bold text-3xl text-qgray-900 tracking-tight">Selected Contacts</h1>
          <p className="text-sm text-qgray-500 mt-0.5">
            {loading ? 'Loading…' : `${contacts.length} contact${contacts.length !== 1 ? 's' : ''} shortlisted across ${firmCount} firm${firmCount !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={handleExport}
            disabled={exporting || contacts.length === 0}
            className="btn-primary disabled:opacity-40 flex items-center gap-2 px-5 py-2.5 text-base font-semibold shadow-md"
          >
            {exporting
              ? <><span className="animate-spin inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full"></span> Exporting…</>
              : <><span className="text-lg">⬇</span> Export CSVs</>
            }
          </button>
          <span className="text-2xs font-semibold text-qgray-400 uppercase tracking-wider">Final Step — exports firms + contacts</span>
        </div>
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
        <div className="flex gap-4 items-start">

          {/* ── A–Z Sidebar ── */}
          <aside className="sticky top-20 flex-shrink-0 w-7 flex flex-col items-center gap-0.5 select-none">
            {ALPHABET.map(letter => {
              const hasFirms  = lettersWithFirms.has(letter)
              const isActive  = activeLetter === letter
              return (
                <button
                  key={letter}
                  onClick={() => hasFirms && scrollToLetter(letter)}
                  disabled={!hasFirms}
                  title={hasFirms ? `Jump to ${letter}` : `No firms starting with ${letter}`}
                  className={`
                    w-6 h-5 rounded text-2xs font-bold leading-none transition-all duration-150
                    ${isActive
                      ? 'bg-qgreen-700 text-white shadow-sm scale-110'
                      : hasFirms
                        ? 'text-qgreen-700 hover:bg-qgreen-50 hover:text-qgreen-800 cursor-pointer'
                        : 'text-qgray-300 cursor-default opacity-40'
                    }
                  `}
                >
                  {letter}
                </button>
              )
            })}
          </aside>

          {/* ── Main table ── */}
          <div className="flex-1 min-w-0">
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-qgray-50 border-b border-qgray-200">
                    <th className="px-4 py-3 text-left w-24">
                      <span className="font-semibold text-2xs uppercase tracking-wider text-qgray-500">Source</span>
                    </th>
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
                    <th className="px-4 py-3 w-32 text-right">
                      <span className="font-semibold text-2xs uppercase tracking-wider text-qgray-500">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map(group => {
                    const firstLetter = (group.firm_name || '').trim().toUpperCase()[0] || '#'
                    // We attach the ref to the first group that starts with this letter
                    const isFirstForLetter =
                      groupedByLetter.has(firstLetter) &&
                      groupedByLetter.get(firstLetter)[0].lp_firm_id === group.lp_firm_id

                    return (
                      <>
                        {/* Firm group header */}
                        <tr
                          key={`group-${group.lp_firm_id}`}
                          ref={isFirstForLetter ? el => { letterRefs.current[firstLetter] = el } : null}
                          className="bg-qgreen-50 border-b border-qgreen-100"
                        >
                          <td colSpan={7} className="px-4 py-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Letter badge — shown only for the first firm of each letter */}
                              {isFirstForLetter && (
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded text-2xs font-bold bg-qgreen-700 text-white flex-shrink-0">
                                  {firstLetter}
                                </span>
                              )}
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
                                {isDynamo ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200 whitespace-nowrap">
                                    Dynamo
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200 whitespace-nowrap">
                                    Preqin
                                  </span>
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
                                  ? <a href={normalizeUrl(c.linkedin_url)} target="_blank" rel="noopener noreferrer"
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
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => navigate(`/firms/${c.lp_firm_id}`)}
                                    className="text-xs text-qgreen-700 hover:text-qgreen-800 font-medium whitespace-nowrap"
                                  >
                                    View →
                                  </button>
                                  {!isDynamo && (
                                    <button
                                      onClick={() => handleRemove(c.id)}
                                      className="text-xs px-2 py-1 rounded border border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300 hover:text-red-700 transition-colors whitespace-nowrap"
                                      title="Remove from shortlist — sends back to available contacts"
                                    >
                                      ✕ Remove
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </>
                    )
                  })}
                </tbody>
              </table>

              <div className="px-4 py-3 border-t border-qgray-100 bg-qgray-50 text-xs text-qgray-400">
                {filtered.length} contact{filtered.length !== 1 ? 's' : ''} across {grouped.length} firm{grouped.length !== 1 ? 's' : ''}
                {debouncedSearch && ` · filtered from ${contacts.length} total`}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
