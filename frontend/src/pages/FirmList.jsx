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

// Tooltip component
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
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 px-3 py-2 text-xs text-white bg-qnavy-800 rounded-lg shadow-lg leading-snug pointer-events-none whitespace-normal">
          {text}
        </span>
      )}
    </span>
  )
}

// Source pill
function SourcePill({ source }) {
  const config = {
    both:        { label: 'D+P', className: 'bg-qnavy-50 text-qnavy-700 border border-qnavy-200', tip: 'Matched across both Dynamo and Preqin.' },
    dynamo_only: { label: 'D',   className: 'bg-purple-50 text-purple-700 border border-purple-200', tip: 'Dynamo only — no Preqin match found.' },
    preqin_only: { label: 'P',   className: 'bg-sky-50 text-sky-700 border border-sky-200',    tip: 'Preqin only — not currently in Dynamo.' },
  }
  const c = config[source] || config.preqin_only
  return (
    <Tooltip text={c.tip}>
      <span className={`ml-1.5 px-1.5 py-0.5 rounded text-2xs font-semibold cursor-default ${c.className}`}>
        {c.label}
      </span>
    </Tooltip>
  )
}

// Contacts cell
function ContactsCell({ firm, maxContacts }) {
  const { available_count, selected_count, pending_count, dynamo_count, workflow_status } = firm
  // Dynamo contacts are auto-accepted; cap only applies to non-Dynamo
  const nonDynamoSelected = Math.max(0, selected_count - (dynamo_count || 0))
  const remaining = Math.max(0, maxContacts - nonDynamoSelected)
  const hasNoContacts = available_count === 0 && pending_count === 0

  if (hasNoContacts) {
    return (
      <Tooltip text="No approvable contacts found for this firm.">
        <span className="text-xs text-qgray-400 cursor-default">No contacts</span>
      </Tooltip>
    )
  }

  if (workflow_status === 'complete') {
    return (
      <span className="text-xs text-qgray-500">
        <span className="font-medium text-qgray-700">{selected_count}</span> shortlisted
        {pending_count > 0 && (
          <span className="ml-2 text-amber-600">· {pending_count} pending</span>
        )}
      </span>
    )
  }

  return (
    <Tooltip text={`${nonDynamoSelected} shortlisted (excl. ${dynamo_count || 0} Dynamo auto-accepted) · ${remaining} slot${remaining !== 1 ? 's' : ''} remaining (cap: ${maxContacts})`}>
      <span className="text-xs cursor-default">
        <span className={`font-semibold ${nonDynamoSelected > 0 ? 'text-qnavy-700' : 'text-qgray-400'}`}>
          {nonDynamoSelected} / {maxContacts}
        </span>
        <span className="text-qgray-400 ml-1">shortlisted</span>
        {(dynamo_count || 0) > 0 && (
          <span className="text-purple-500 ml-1">· {dynamo_count} Dynamo</span>
        )}
        {pending_count > 0 && (
          <span className="ml-1 text-amber-600">· {pending_count} to review</span>
        )}
      </span>
    </Tooltip>
  )
}

// Sortable column header
function SortableHeader({ label, col, current, dir, onSort, tooltip }) {
  const active = current === col
  const header = (
    <button
      onClick={() => onSort(col)}
      className={`flex items-center gap-1 font-semibold text-2xs uppercase tracking-wider transition-colors
        ${active ? 'text-qnavy-800' : 'text-qgray-500 hover:text-qgray-700'}`}
    >
      {label}
      <span className="text-qgray-400 text-xs">{active ? (dir === 'asc' ? '↑' : '↓') : '↕'}</span>
    </button>
  )
  return tooltip ? <Tooltip text={tooltip}>{header}</Tooltip> : header
}

// Stats bar
function StatsBar({ stats }) {
  if (!stats) return null
  const items = [
    { label: 'Needs Attention', value: stats.firms_needs_attention, color: 'text-amber-700', dot: 'bg-amber-400' },
    { label: 'Unreviewed',      value: stats.firms_unreviewed,      color: 'text-qgray-700',  dot: 'bg-qgray-400' },
    { label: 'In Progress',     value: stats.firms_in_progress,     color: 'text-qnavy-700',  dot: 'bg-qnavy-500' },
    { label: 'Complete',        value: stats.firms_complete,        color: 'text-qteal-700',  dot: 'bg-qteal-500' },
    { label: 'Shortlisted',     value: `${stats.selected ?? 0}`,   color: 'text-qnavy-800',  dot: 'bg-qnavy-800' },
  ]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
      {items.map(({ label, value, color, dot }) => (
        <div key={label} className="stat-card">
          <div className="flex items-center gap-1.5 mb-1">
            <span className={`w-2 h-2 rounded-full ${dot} flex-shrink-0`}></span>
            <span className="text-2xs font-semibold text-qgray-500 uppercase tracking-wider">{label}</span>
          </div>
          <div className={`text-2xl font-semibold ${color}`}>{value ?? '—'}</div>
        </div>
      ))}
    </div>
  )
}

// Styled select filter with label
function FilterSelect({ label, value, onChange, children, placeholder }) {
  const isActive = value !== ''
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <label className="text-2xs font-semibold text-qgray-500 uppercase tracking-wider px-0.5">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`select text-sm ${isActive ? 'active' : ''}`}
      >
        <option value="">{placeholder || `All ${label}`}</option>
        {children}
      </select>
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
  const [options, setOptions]         = useState({ institution_types: [], regions: [], countries: [], cities: [] })
  const [stats, setStats]             = useState(null)
  const [maxContacts, setMaxContacts] = useState(5)

  const [search, setSearch]             = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [instType, setInstType]         = useState('')
  const [region, setRegion]             = useState('')
  const [country, setCountry]           = useState('')
  const [city, setCity]                 = useState('')
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
        country,
        city,
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
  }, [debouncedSearch, sourceFilter, instType, region, country, city, wfStatus, page, sortBy, sortDir])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, sourceFilter, instType, region, country, city, wfStatus, sortBy, sortDir])

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

  function clearFilters() {
    setSearch(''); setSourceFilter(''); setInstType('')
    setRegion(''); setCountry(''); setCity(''); setWfStatus('')
  }

  const activeFilterCount = [sourceFilter, instType, region, country, city, wfStatus].filter(Boolean).length

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))

  function displayStatus(firm) {
    if (firm.available_count === 0 && firm.pending_count === 0) return 'no_contacts'
    return firm.workflow_status
  }

  // Filter countries/cities based on selected region (if region is set)
  const filteredCountries = region && options.countryByRegion
    ? (options.countryByRegion[region] || options.countries)
    : options.countries || []

  return (
    <div className="space-y-4 h-full">

      {/* Stats bar */}
      <StatsBar stats={stats} />

      {/* Filter bar */}
      <div className="filter-bar">
        {/* Search row */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-0.5 flex-1 min-w-48">
            <label className="text-2xs font-semibold text-qgray-500 uppercase tracking-wider px-0.5">Search</label>
            <input
              type="search"
              placeholder="Search firms…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input text-sm"
            />
          </div>

          {/* Status */}
          <FilterSelect label="Status" value={wfStatus} onChange={setWfStatus} placeholder="All Statuses">
            <option value="needs_attention">Needs Attention</option>
            <option value="unreviewed">Unreviewed</option>
            <option value="in_progress">In Progress</option>
            <option value="complete">Complete</option>
            <option value="no_contacts">No Contacts</option>
          </FilterSelect>

          {/* Institution type */}
          <FilterSelect label="Type" value={instType} onChange={setInstType} placeholder="All Types">
            {options.institution_types.map(t => <option key={t} value={t}>{t}</option>)}
          </FilterSelect>

          {/* Source */}
          <FilterSelect label="Source" value={sourceFilter} onChange={setSourceFilter} placeholder="All Sources">
            <option value="both">Dynamo + Preqin</option>
            <option value="dynamo_only">Dynamo only</option>
            <option value="preqin_only">Preqin only</option>
          </FilterSelect>

          <div className="flex items-end gap-2 ml-auto flex-shrink-0">
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="text-sm text-qnavy-600 hover:text-qnavy-800 font-medium py-2 whitespace-nowrap">
                Clear filters ({activeFilterCount})
              </button>
            )}
            <button
              onClick={handleExport}
              disabled={exporting}
              className="btn-secondary whitespace-nowrap"
            >
              {exporting ? 'Exporting…' : '↓ Export CSV'}
            </button>
          </div>
        </div>

        {/* Geography row */}
        <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-qgray-100">
          <div className="flex items-center gap-1.5 text-2xs font-semibold text-qgray-500 uppercase tracking-wider self-end mb-2">
            Geography
          </div>

          <FilterSelect label="Region" value={region} onChange={v => { setRegion(v); setCountry(''); setCity('') }} placeholder="All Regions">
            {(options.regions || []).map(r => <option key={r} value={r}>{r}</option>)}
          </FilterSelect>

          <FilterSelect label="Country" value={country} onChange={v => { setCountry(v); setCity('') }} placeholder="All Countries">
            {filteredCountries.map(c => <option key={c} value={c}>{c}</option>)}
          </FilterSelect>

          <FilterSelect label="City" value={city} onChange={setCity} placeholder="All Cities">
            {(options.cities || []).map(c => <option key={c} value={c}>{c}</option>)}
          </FilterSelect>
        </div>
      </div>

      {/* Firm table */}
      <div className="card overflow-hidden">
        {/* Table toolbar */}
        <div className="px-4 py-2.5 border-b border-qgray-100 flex items-center justify-between bg-qgray-50">
          <span className="text-sm text-qgray-500">
            {loading ? 'Loading…' : `${total.toLocaleString()} firm${total !== 1 ? 's' : ''}`}
          </span>
          <div className="flex items-center gap-4 text-sm text-qgray-500">
            <Tooltip text="Global cap per firm for non-Dynamo contacts. Advisory — not enforced.">
              <span className="cursor-default text-xs font-medium">Cap: {maxContacts} / firm</span>
            </Tooltip>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-2 py-0.5 rounded border border-qgray-200 disabled:opacity-40 hover:bg-white text-xs">
                  ←
                </button>
                <span className="text-xs">{page} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="px-2 py-0.5 rounded border border-qgray-200 disabled:opacity-40 hover:bg-white text-xs">
                  →
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-qgray-200 bg-qgray-50">
                <th className="px-4 py-3 text-left w-72">
                  <SortableHeader label="Firm" col="lp_name" current={sortBy} dir={sortDir} onSort={toggleSort} />
                </th>
                <th className="px-4 py-3 text-left">
                  <SortableHeader label="Type" col="institution_type" current={sortBy} dir={sortDir} onSort={toggleSort} />
                </th>
                <th className="px-4 py-3 text-left">
                  <SortableHeader label="Location" col="country" current={sortBy} dir={sortDir} onSort={toggleSort} />
                </th>
                <th className="px-4 py-3 text-left">
                  <SortableHeader label="Contacts" col="selected_count" current={sortBy} dir={sortDir} onSort={toggleSort}
                    tooltip="Sort by number of shortlisted contacts." />
                </th>
                <th className="px-4 py-3 text-left">
                  <SortableHeader label="Status" col="workflow_status" current={sortBy} dir={sortDir} onSort={toggleSort} />
                </th>
                <th className="px-4 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-16 text-qgray-400 text-sm">Loading…</td>
                </tr>
              ) : firms.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-16 text-qgray-400 text-sm">
                    No firms match your filters.{' '}
                    {activeFilterCount > 0 && (
                      <button onClick={clearFilters} className="text-qnavy-600 hover:underline">Clear filters</button>
                    )}
                  </td>
                </tr>
              ) : firms.map(firm => {
                const status = displayStatus(firm)
                const noContacts = status === 'no_contacts'
                return (
                  <tr
                    key={firm.id}
                    onClick={() => !noContacts && navigate(`/firms/${firm.id}`)}
                    className={`border-b border-qgray-50 transition-colors
                      ${noContacts
                        ? 'opacity-40 cursor-default'
                        : 'hover:bg-qnavy-50 cursor-pointer'}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <span className="font-medium text-sm text-qgray-900 truncate max-w-xs">
                          {firm.display_name || firm.lp_name}
                        </span>
                        <SourcePill source={firm.source} />
                      </div>
                    </td>

                    <td className="px-4 py-3 text-sm text-qgray-600 whitespace-nowrap">
                      {firm.institution_type || <span className="text-qgray-300">—</span>}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm text-qgray-700">
                        {firm.city
                          ? <span>{firm.city}</span>
                          : firm.country
                          ? <span>{firm.country}</span>
                          : <span className="text-qgray-300">—</span>}
                      </div>
                      {firm.country && firm.city && (
                        <div className="text-xs text-qgray-400 mt-0.5">{firm.country}{firm.region ? ` · ${firm.region}` : ''}</div>
                      )}
                      {!firm.city && firm.region && (
                        <div className="text-xs text-qgray-400 mt-0.5">{firm.region}</div>
                      )}
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
                      {!noContacts && (
                        <button
                          onClick={e => { e.stopPropagation(); navigate(`/firms/${firm.id}`) }}
                          className="text-sm text-qnavy-600 hover:text-qnavy-800 font-medium whitespace-nowrap"
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

        {/* Pagination footer */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-qgray-100 flex justify-between items-center text-sm text-qgray-500 bg-qgray-50">
            <span>Page {page} of {totalPages} &middot; {total.toLocaleString()} firms</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(1)} disabled={page === 1}
                className="px-3 py-1 rounded border border-qgray-200 disabled:opacity-40 hover:bg-white text-xs">First</button>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1 rounded border border-qgray-200 disabled:opacity-40 hover:bg-white text-xs">Prev</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1 rounded border border-qgray-200 disabled:opacity-40 hover:bg-white text-xs">Next</button>
              <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
                className="px-3 py-1 rounded border border-qgray-200 disabled:opacity-40 hover:bg-white text-xs">Last</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
