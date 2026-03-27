import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getFirms, getOptions, getStats, exportContacts } from '../api'
import StatusBadge from '../components/StatusBadge'

function useDebounce(value, delay = 400) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export default function FirmList() {
  const navigate = useNavigate()

  const [firms, setFirms]       = useState([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [loading, setLoading]   = useState(true)
  const [exporting, setExporting] = useState(false)
  const [options, setOptions]   = useState({ institution_types: [], regions: [] })
  const [stats, setStats]       = useState(null)

  const [search, setSearch]           = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [instType, setInstType]       = useState('')
  const [region, setRegion]           = useState('')
  const [badge, setBadge]             = useState('')
  const [sortBy, setSortBy]           = useState('lp_name')
  const [sortDir, setSortDir]         = useState('asc')

  const debouncedSearch = useDebounce(search)
  const PER_PAGE = 50

  // Load dropdown options and summary stats once
  useEffect(() => {
    getOptions().then(setOptions).catch(console.error)
    getStats().then(setStats).catch(console.error)
  }, [])

  const loadFirms = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getFirms({
        search:           debouncedSearch,
        source:           sourceFilter,
        institution_type: instType,
        region,
        status_badge:     badge,
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
  }, [debouncedSearch, sourceFilter, instType, region, badge, page, sortBy, sortDir])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, sourceFilter, instType, region, badge, sortBy, sortDir])

  useEffect(() => {
    loadFirms()
  }, [loadFirms])

  function toggleSort(col) {
    if (sortBy === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(col)
      setSortDir('asc')
    }
  }

  function SortIndicator({ col }) {
    if (sortBy !== col) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="text-blue-600 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  async function handleExport() {
    setExporting(true)
    try { await exportContacts() }
    catch (err) { alert('Export failed: ' + err.message) }
    finally { setExporting(false) }
  }

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">LP Firms</h1>
          {stats && (
            <p className="text-sm text-gray-500 mt-0.5">
              {stats.total_firms.toLocaleString()} firms ·{' '}
              {stats.selected.toLocaleString()} selected contacts ·{' '}
              {stats.pending_review.toLocaleString()} pending review
            </p>
          )}
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="btn-primary text-sm"
        >
          {exporting ? 'Exporting…' : '⬇ Export selected CSV'}
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <input
            type="text"
            placeholder="Search firms…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input col-span-2"
          />
          <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} className="select">
            <option value="">All sources</option>
            <option value="both">Both (Dynamo + Preqin)</option>
            <option value="dynamo_only">Dynamo only</option>
            <option value="preqin_only">Preqin only</option>
          </select>
          <select value={instType} onChange={e => setInstType(e.target.value)} className="select">
            <option value="">All types</option>
            {options.institution_types.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select value={region} onChange={e => setRegion(e.target.value)} className="select">
            <option value="">All regions</option>
            {options.regions.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <select value={badge} onChange={e => setBadge(e.target.value)} className="select">
            <option value="">All statuses</option>
            <option value="no_contacts">No contacts</option>
            <option value="needs_review">Needs review</option>
            <option value="ready">Ready</option>
            <option value="active">Active</option>
            <option value="overdue">Overdue</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th
                  className="text-left px-4 py-3 font-medium text-gray-600 cursor-pointer select-none"
                  onClick={() => toggleSort('lp_name')}
                >
                  Firm name <SortIndicator col="lp_name" />
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Region</th>
                <th
                  className="text-center px-4 py-3 font-medium text-gray-600 cursor-pointer select-none"
                  onClick={() => toggleSort('selected_count')}
                >
                  Selected <SortIndicator col="selected_count" />
                </th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Approved</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Pending</th>
                <th
                  className="text-left px-4 py-3 font-medium text-gray-600 cursor-pointer select-none"
                  onClick={() => toggleSort('last_outreach')}
                >
                  Last outreach <SortIndicator col="last_outreach" />
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-400">
                    Loading…
                  </td>
                </tr>
              ) : firms.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-400">
                    No firms match your filters.
                  </td>
                </tr>
              ) : (
                firms.map(firm => (
                  <tr
                    key={firm.id}
                    className="table-row"
                    onClick={() => navigate(`/firms/${firm.id}`)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-xs">
                      <div className="truncate">{firm.display_name || firm.lp_name}</div>
                      {firm.investor_status === 'Active LP' && (
                        <span className="text-xs text-green-600 font-normal">Active LP</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {firm.institution_type || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {firm.region || firm.country || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-medium ${firm.selected_count > 0 ? 'text-blue-700' : 'text-gray-400'}`}>
                        {firm.selected_count}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{firm.approved_count}</td>
                    <td className="px-4 py-3 text-center">
                      {firm.pending_count > 0 ? (
                        <span className="text-yellow-600 font-medium">{firm.pending_count}</span>
                      ) : (
                        <span className="text-gray-300">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                      {firm.last_outreach_date || <span className="text-gray-300">Never</span>}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge badge={firm.status_badge} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && total > PER_PAGE && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-600">
            <span>
              Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, total)} of {total.toLocaleString()}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="btn-secondary py-1 px-3 disabled:opacity-40"
              >
                ← Prev
              </button>
              <span className="px-2">{page} / {totalPages}</span>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(p => p + 1)}
                className="btn-secondary py-1 px-3 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
