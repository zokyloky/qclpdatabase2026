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
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 px-3 py-2 text-xs text-white bg-qgreen-800 rounded-lg shadow-lg leading-snug pointer-events-none whitespace-normal">
          {text}
        </span>
      )}
    </span>
  )
}

// Source pill
function SourcePill({ source }) {
  const config = {
    both:        { label: 'D+P', className: 'bg-qgreen-50 text-qgreen-700 border border-qgreen-200', tip: 'Matched across both Dynamo and Preqin.' },
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
        <span className={`font-semibold ${nonDynamoSelected > 0 ? 'text-qgreen-700' : 'text-qgray-400'}`}>
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

// Format a UTC date string as a short relative or absolute label
function formatReviewed(isoStr) {
  if (!isoStr) return null
  const d = new Date(isoStr)
  const now = new Date()
  const diffDays = Math.floor((now - d) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7)  return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Sortable column header
function SortableHeader({ label, col, current, dir, onSort, tooltip }) {
  const active = current === col
  const header = (
    <button
      onClick={() => onSort(col)}
      className={`flex items-center gap-1 font-semibold text-2xs uppercase tracking-wider transition-colors
        ${active ? 'text-qgreen-800' : 'text-qgray-500 hover:text-qgray-700'}`}
    >
      {label}
      <span className="text-qgray-400 text-xs">{active ? (dir === 'asc' ? '↑' : '↓') : '↕'}</span>
    </button>
  )
  return tooltip ? <Tooltip text={tooltip}>{header}</Tooltip> : header
}

// Info icon for stat tooltips
function InfoIcon() {
  return (
    <svg className="w-3 h-3 text-qgray-400 flex-shrink-0" fill="none" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M8 7v5M8 5.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

// Individual stat card
function StatCard({ label, value, sub, color, dot, tip, warn }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      className={`stat-card relative ${warn ? 'border-amber-300 bg-amber-50' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`w-2 h-2 rounded-full ${dot} flex-shrink-0`}></span>
        <span className="text-2xs font-semibold text-qgray-500 uppercase tracking-wider leading-none">{label}</span>
        <InfoIcon />
        {hovered && tip && (
          <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 px-3 py-2 text-xs text-white bg-qgreen-800 rounded-lg shadow-lg leading-snug pointer-events-none whitespace-normal">
            {tip}
          </span>
        )}
      </div>
      <div className={`font-display font-bold text-2xl tracking-tight ${warn ? 'text-amber-700' : color}`}>
        {value ?? '—'}
        {sub && <span className="text-sm font-sans font-normal text-qgray-400 ml-1.5">{sub}</span>}
      </div>
    </div>
  )
}

// Stats bar
function StatsBar({ stats }) {
  if (!stats) return null

  const total        = stats.total_firms ?? 0
  const complete     = stats.firms_complete ?? 0
  const pctComplete  = total > 0 ? Math.round((complete / total) * 100) : 0
  const pendingReview = stats.pending_review ?? 0

  return (
    <div className="space-y-2 mb-5">
      {/* Pending review warning banner */}
      {pendingReview > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-center gap-3">
          <span className="text-amber-500 text-base flex-shrink-0">⚠</span>
          <p className="text-sm text-amber-800">
            <span className="font-semibold">{pendingReview.toLocaleString()} contact{pendingReview !== 1 ? 's' : ''} pending review</span>
            {' '}— resolve these in the Review Queue before finalising your contact selections.
          </p>
        </div>
      )}

      {/* Firm pipeline section */}
      <div>
        <p className="text-2xs font-semibold text-qgray-400 uppercase tracking-widest mb-1.5 px-0.5">Firm Pipeline</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Needs Attention" dot="bg-amber-400" color="text-amber-700"
            value={(stats.firms_needs_attention ?? 0).toLocaleString()}
            tip="Firms flagged for attention — e.g. roles have changed or new contacts need review."
          />
          <StatCard
            label="Unreviewed" dot="bg-qgray-400" color="text-qgray-700"
            value={(stats.firms_unreviewed ?? 0).toLocaleString()}
            tip="Firms with available contacts that haven't been opened yet."
          />
          <StatCard
            label="In Progress" dot="bg-qgreen-500" color="text-qgreen-700"
            value={(stats.firms_in_progress ?? 0).toLocaleString()}
            tip="Firms where contact selection has started but not yet marked complete."
          />
          <StatCard
            label="Complete" dot="bg-qgreen-600" color="text-qgreen-700"
            value={complete.toLocaleString()}
            sub={`${pctComplete}%`}
            tip={`${pctComplete}% of all ${total.toLocaleString()} active firms have been marked complete.`}
          />
        </div>
      </div>

      {/* Contacts section */}
      <div>
        <p className="text-2xs font-semibold text-qgray-400 uppercase tracking-widest mb-1.5 px-0.5">Contacts</p>
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Shortlisted" dot="bg-qgreen-800" color="text-qgreen-800"
            value={(stats.selected ?? 0).toLocaleString()}
            tip="Total contacts shortlisted across all firms (Dynamo auto-accepted + manually selected)."
          />
          <StatCard
            label="Pending Review" dot="bg-amber-400" color="text-qgray-700"
            value={pendingReview.toLocaleString()}
            warn={pendingReview > 0}
            tip="Contacts flagged for review — approve or exclude them before finalising selections."
          />
        </div>
      </div>
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
  const [loading, setLoading]         = useState(true)   // first-ever load
  const [refreshing, setRefreshing]   = useState(false)  // subsequent reloads (keep rows visible)
  const [exporting, setExporting]     = useState(false)
  const [options, setOptions]         = useState({ institution_types: [], regions: [], countries: [], cities: [] })
  const [stats, setStats]             = useState(null)
  const [maxContacts, setMaxContacts] = useState(5)

  const [search, setSearch]                 = useState('')
  const [sourceFilter, setSourceFilter]     = useState('')
  const [instType, setInstType]             = useState('')
  const [region, setRegion]                 = useState('')
  const [country, setCountry]               = useState('')
  const [city, setCity]                     = useState('')
  const [wfStatus, setWfStatus]             = useState('')
  const [showNoContacts, setShowNoContacts] = useState(false)
  const [sortBy, setSortBy]                 = useState('workflow_priority')
  const [sortDir, setSortDir]               = useState('asc')

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
    // First load: show full loading state. Subsequent: dim the table so it feels instant.
    setRefreshing(true)
    try {
      const data = await getFirms({
        search:              debouncedSearch,
        source:              sourceFilter,
        institution_type:    instType,
        region,
        country,
        city,
        workflow_status:     wfStatus,
        include_no_contacts: showNoContacts,
        page,
        per_page:            PER_PAGE,
        sort_by:             sortBy,
        sort_dir:            sortDir,
      })
      setFirms(data.firms)
      setTotal(data.total)
      setLoading(false)
    } catch (err) {
      console.error(err)
    } finally {
      setRefreshing(false)
    }
  }, [debouncedSearch, sourceFilter, instType, region, country, city, wfStatus, showNoContacts, page, sortBy, sortDir])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, sourceFilter, instType, region, country, city, wfStatus, showNoContacts, sortBy, sortDir])

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
              <button onClick={clearFilters} className="text-sm text-qgreen-700 hover:text-qgreen-800 font-medium py-2 whitespace-nowrap">
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

        {/* No Contacts toggle */}
        <div className="mt-3 pt-3 border-t border-qgray-100 flex items-center gap-2">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showNoContacts}
              onChange={e => setShowNoContacts(e.target.checked)}
              className="w-4 h-4 rounded border-qgray-300 accent-qgreen-700 cursor-pointer"
            />
            <span className="text-sm text-qgray-600 font-medium">Include firms with no contacts</span>
          </label>
          <Tooltip text="Firms that have no approvable contacts in either Preqin or Dynamo. Hidden by default to keep the list actionable.">
            <span className="cursor-default">
              <svg className="w-3.5 h-3.5 text-qgray-400" fill="none" viewBox="0 0 16 16">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M8 7v5M8 5.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </span>
          </Tooltip>
        </div>
      </div>

      {/* Firm table */}
      <div className="card overflow-hidden">
        {/* Table toolbar */}
        <div className="px-4 py-2.5 border-b border-qgray-100 flex items-center justify-between bg-qgray-50">
          <span className="text-sm text-qgray-500 flex items-center gap-2">
            {`${total.toLocaleString()} firm${total !== 1 ? 's' : ''}`}
            {refreshing && <span className="text-xs text-qgray-400 animate-pulse">Updating…</span>}
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

        <div className={`overflow-x-auto transition-opacity duration-200 ${refreshing ? 'opacity-50' : 'opacity-100'}`}>
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
                  <Tooltip text="Preqin Firm ID. Dynamo ID shown below in smaller text.">
                    <span className="font-semibold text-2xs uppercase tracking-wider text-qgray-500 cursor-default">IDs</span>
                  </Tooltip>
                </th>
                <th className="px-4 py-3 text-left">
                  <SortableHeader label="Contacts" col="selected_count" current={sortBy} dir={sortDir} onSort={toggleSort}
                    tooltip="Sort by number of shortlisted contacts." />
                </th>
                <th className="px-4 py-3 text-left">
                  <SortableHeader label="Status" col="workflow_status" current={sortBy} dir={sortDir} onSort={toggleSort} />
                </th>
                <th className="px-4 py-3 text-left">
                  <Tooltip text="Date this firm's contact review was last marked complete.">
                    <span className="font-semibold text-2xs uppercase tracking-wider text-qgray-500 cursor-default">Last Reviewed</span>
                  </Tooltip>
                </th>
                <th className="px-4 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {loading && firms.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-qgray-400 text-sm">Loading…</td>
                </tr>
              ) : firms.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-qgray-400 text-sm">
                    No firms match your filters.{' '}
                    {activeFilterCount > 0 && (
                      <button onClick={clearFilters} className="text-qgreen-700 hover:underline">Clear filters</button>
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
                        : 'hover:bg-qgreen-50 cursor-pointer'}`}
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
                      {firm.preqin_firm_id ? (
                        <div>
                          <Tooltip text={`Preqin Firm ID: ${firm.preqin_firm_id}`}>
                            <span className="font-semibold text-xs text-qgreen-700 bg-qgreen-50 border border-qgreen-200 px-1.5 py-0.5 rounded cursor-default tracking-wide">
                              {firm.preqin_firm_id}
                            </span>
                          </Tooltip>
                          {firm.dynamo_internal_id && (
                            <div className="mt-0.5 text-2xs text-qgray-400 font-mono truncate max-w-[9rem]" title={firm.dynamo_internal_id}>
                              {firm.dynamo_internal_id}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-qgray-300 text-xs">—</span>
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

                    <td className="px-4 py-3">
                      {firm.workflow_completed_at ? (
                        <Tooltip text={new Date(firm.workflow_completed_at).toLocaleString()}>
                          <span className="text-xs text-qgray-500 cursor-default">
                            {formatReviewed(firm.workflow_completed_at)}
                          </span>
                        </Tooltip>
                      ) : (
                        <span className="text-xs text-qgray-300">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right">
                      {!noContacts && (
                        <button
                          onClick={e => { e.stopPropagation(); navigate(`/firms/${firm.id}`) }}
                          className="text-sm text-qgreen-700 hover:text-qgreen-800 font-medium whitespace-nowrap"
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
