import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getFirms, getOptions, getStats, getSettings, exportContacts } from '../api'
import StatusBadge from '../components/StatusBadge'

function useDebounce(value, delay = 400) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// Tooltip component — hover to see explanation
function Tooltip({ text, children }) {
  const [visible, setVisible] = useState(false)
  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-56 px-3 py-2 text-xs text-white bg-gray-800 rounded shadow-lg leading-snug pointer-events-none">
          {text}
        </span>
      )}
    </span>
  )
}

// Source pill shown next to firm name
function SourcePill({ source }) {
  const config = {
    both:        { label: 'D+P', bg: 'bg-indigo-100', text: 'text-indigo-700',
                   tip: 'Matched across both Dynamo and Preqin.' },
    dynamo_only: { label: 'D',   bg: 'bg-purple-100', text: 'text-purple-700',
                   tip: 'This firm exists in Dynamo only — no Preqin match found.' },
    preqin_only: { label: 'P',   bg: 'bg-sky-100',    text: 'text-sky-700',
                   tip: 'This firm is from Preqin only — not currently in Dynamo.' },
  }
  const c = config[source] || config.preqin_only
  return (
    <Tooltip text={c.tip}>
      <span className={`ml-1.5 px-1.5 py-0.5 rounded text-xs font-semibold ${c.bg} ${c.text} cursor-default`}>
        {c.label}
      </span>
    </Tooltip>
  )
}

// Contacts cell — the primary information display per firm
function ContactsCell({ firm, maxContacts }) {
  const { available_count, selected_count, pending_count, workflow_status } = firm
  const remaining = Math.max(0, maxContacts - selected_count)
  const hasNoContacts = available_count === 0 && pending_count === 0

  if (hasNoContacts) {
    return (
      <Tooltip text="No approvable contacts found for this firm in either Dynamo or Preqin.">
        <span className="text-xs text-gray-400 cursor-default">No contacts</span>
      </Tooltip>
    )
  }

  if (workflow_status === 'complete') {
    return (
      <span className="text-xs text-gray-500">
        <span className="font-medium text-gray-700">{selected_count}</span> shortlisted
        {pending_count > 0 && (
          <span className="ml-2 text-amber-600">· {pending_count} under review</span>
        )}
      </span>
    )
  }

  return (
    <Tooltip text={`${selected_count} shortlisted · ${available_count} available · ${remaining} slot${remaining !== 1 ? 's' : ''} remaining (cap: ${maxContacts})`}>
      <span className="text-xs cursor-default">
        <span className={`font-semibold ${selected_count > 0 ? 'text-blue-700' : 'text-gray-400'}`}>
          {selected_count} / {maxContacts}
        </span>
        <span className="text-gray-400 ml-1">shortlisted</span>
        {available_count > 0 && (
          <span className="text-gray-400 ml-1">· {available_count} available</span>
        )}
        {pending_count > 0 && (
          <span className="ml-1 text-amber-600">· {pending_count} to review</span>
        )}
      </span>
    </Tooltip>
  )
}

// Column header with optional sort toggle
function SortableHeader({ label, col, current, dir, onSort, tooltip }) {
  const active = current === col
  const header = (
    <button
      onClick={() => onSort(col)}
      className={`flex items-center gap-1 font-medium text-xs uppercase tracking-wide
        ${active ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
    >
      {label}
      <span className="text-gray-400">{active ? (dir === 'asc' ? '↑' : '↓') : '↕'}</span>
    </button>
  )
  return tooltip ? <Tooltip text={tooltip}>{header}</Tooltip> : header
}

// Summary stats bar across the top
function StatsBar({ stats, maxContacts }) {
  if (!stats) return null
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
      {[
        { label: 'Needs Attention', value: stats.firms_needs_attention, color: 'text-amber-700' },
        { label: 'Unreviewed',      value: stats.firms_unreviewed,      color: 'text-gray-700'  },
        { label: 'In Progress',     value: stats.firms_in_progress,     color: 'text-blue-700'  },
        { label: 'Complete',        value: stats.firms_complete,        color: 'text-green-700' },
        { label: 'Shortlisted',     value: `${stats.selected ?? 0} contacts`, color: 'text-gray-900' },
      ].map(({ label, value, color }) => (
        <div key={label} className="bg-white rounded-lg border border-gray-200 px-4 py-3">
          <div className={`text-xl font-semibold ${color}`}>{value ?? '—'}</div>
          <div className="text-xs text-gray-500 mt-0.5">{label}</div>
        </div>
      ))}
    </div>
  )
}

export default function FirmList() {
  const navigate = useNavigate()

  const [firms, setFirms]             = useState([])
  const [total, setTotal]             = useState(0)
  const [page, setPage]               = useState(1)
  const [loading, setLoading]         = useState(true)
  const [exporting, setExporting]     = useState(false)
  const [options, setOptions]         = useState({ institution_types: [], regions: [] })
  const [stats, setStats]             = useState(null)
  const [maxContacts, setMaxContacts] = useState(5)

  const [search, setSearch]             = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [instType, setInstType]         = useState('')
  const [region, setRegion]             = useState('')
  const [wfStatus, setWfStatus]         = useState('')
  const [sortBy, setSortBy]             = useState('workflow_priority')
  const [sortDir, setSortDir]           = useState('asc')

  const debouncedSearch = useDebounce(search)
  const PER_PAGE = 50

  useEffect(() => {
    getOptions().then(setOptions).catch(console.error)
    getStats().then(setStats).catch(console.error)
    getSettings().then(s => {
      if (s.max_contacts_per_firm) setMaxContacts(parseInt(s.max_contacts_per_firm, 10))
    }).catch(console.error)
  }, [])

  const loadFirms = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getFirms({
        search:           debouncedSearch,
        source:           sourceFilter,
        institution_type: instType,
        region,
        workflow_status:  wfStatus,
        page,
        per_page:         PER_PAGE,
        sort_by:          sortBy,
        sort_dir:         sortDir,
      })
      setFirms(data.firms)
      setTotal(data.total)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, sourceFilter, instType, region, wfStatus, page, sortBy, sortDir])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, sourceFilter, instType, region, wfStatus, sortBy, sortDir])

  useEffect(() => { loadFirms() }, [loadFirms])

  function toggleSort(col) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
  }

  async function handleExport() {
    setExporting(true)
    try { await exportContacts() } catch (e) { alert(e.message) }
    finally { setExporting(false) }
  }

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))

  function displayStatus(firm) {
    if (firm.available_count === 0 && firm.pending_count === 0) return 'no_contacts'
    return firm.workflow_status
  }

  return (
    <div className="space-y-4">

      {/* Stats bar */}
      <StatsBar stats={stats} maxContacts={maxContacts} />

      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex flex-wrap gap-3 items-center">
        <input
          type="search"
          placeholder="Search firms…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input text-sm flex-1 min-w-40"
        />

        <select value={wfStatus} onChange={e => setWfStatus(e.target.value)} className="select text-sm">
          <option value="">All statuses</option>
          <option value="needs_attention">Needs Attention</option>
          <option value="unreviewed">Unreviewed</option>
          <option value="in_progress">In Progress</option>
          <option value="complete">Complete</option>
          <option value="no_contacts">No Contacts</option>
        </select>

        <select value={instType} onChange={e => setInstType(e.target.value)} className="select text-sm">
          <option value="">All types</option>
          {options.institution_types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} className="select text-sm">
          <option value="">All sources</option>
          <option value="both">Dynamo + Preqin</option>
          <option value="dynamo_only">Dynamo only</option>
          <option value="preqin_only">Preqin only</option>
        </select>

        <select value={region} onChange={e => setRegion(e.target.value)} className="select text-sm">
          <option value="">All regions</option>
          {options.regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        <button
          onClick={handleExport}
          disabled={exporting}
          className="btn-secondary text-sm py-1.5 whitespace-nowrap"
        >
          {exporting ? 'Exporting…' : '↓ Export CSV'}
        </button>
      </div>

      {/* Firm table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm text-gray-500">
            {loading ? 'Loading…' : `${total.toLocaleString()} firms`}
          </span>
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <Tooltip text="Global cap per firm. Advisory — not enforced.">
              <span className="cursor-default">Cap: {maxContacts} contacts / firm</span>
            </Tooltip>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-2 py-0.5 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">←</button>
                <span>{page} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="px-2 py-0.5 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">→</button>
              </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-2.5 text-left w-80">
                  <SortableHeader label="Firm" col="lp_name" current={sortBy} dir={sortDir} onSort={toggleSort} />
                </th>
                <th className="px-4 py-2.5 text-left">
                  <SortableHeader label="Type" col="institution_type" current={sortBy} dir={sortDir} onSort={toggleSort} />
                </th>
                <th className="px-4 py-2.5 text-left">
                  <SortableHeader label="Location" col="country" current={sortBy} dir={sortDir} onSort={toggleSort} />
                </th>
                <th className="px-4 py-2.5 text-left">
                  <Tooltip text="Contacts shortlisted vs. available. The cap is advisory — not enforced.">
                    <span className="font-medium text-xs uppercase tracking-wide text-gray-500 cursor-default">Contacts</span>
                  </Tooltip>
                </th>
                <th className="px-4 py-2.5 text-left">
                  <Tooltip text="Where this firm sits in your review workflow.">
                    <span className="font-medium text-xs uppercase tracking-wide text-gray-500 cursor-default">Status</span>
                  </Tooltip>
                </th>
                <th className="px-4 py-2.5 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-16 text-gray-400 text-sm">Loading…</td>
                </tr>
              ) : firms.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-16 text-gray-400 text-sm">No firms match your filters.</td>
                </tr>
              ) : firms.map(firm => {
                const status = displayStatus(firm)
                const noContacts = status === 'no_contacts'
                return (
                  <tr
                    key={firm.id}
                    onClick={() => !noContacts && navigate(`/firms/${firm.id}`)}
                    className={`border-b border-gray-50 transition-colors
                      ${noContacts
                        ? 'opacity-50 cursor-default'
                        : 'hover:bg-blue-50 cursor-pointer'}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <span className="font-medium text-sm text-gray-900 truncate max-w-xs">
                          {firm.display_name || firm.lp_name}
                        </span>
                        <SourcePill source={firm.source} />
                      </div>
                    </td>

                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {firm.institution_type || <span className="text-gray-300">—</span>}
                    </td>

                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {firm.country || firm.region
                        ? [firm.country, firm.region].filter(Boolean).join(' · ')
                        : <span className="text-gray-300">—</span>}
                    </td>

                    <td className="px-4 py-3">
                      <ContactsCell firm={firm} maxContacts={maxContacts} />
                    </td>

                    <td className="px-4 py-3">
                      <div>
                        <StatusBadge status={status} />
                        {firm.review_reason && (
                          <p className="text-xs text-amber-700 mt-1 max-w-xs leading-snug">{firm.review_reason}</p>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-right">
                      {noContacts ? (
                        <Tooltip text="No contacts available to review for this firm.">
                          <span className="text-xs text-gray-300 cursor-default">No contacts</span>
                        </Tooltip>
                      ) : (
                        <button
                          onClick={e => { e.stopPropagation(); navigate(`/firms/${firm.id}`) }}
                          className="text-sm text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
                        >
                          Review →
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex justify-between items-center text-sm text-gray-500">
            <span>Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(1)} disabled={page === 1}
                className="px-3 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">First</button>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">Prev</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">Next</button>
              <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
                className="px-3 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">Last</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
