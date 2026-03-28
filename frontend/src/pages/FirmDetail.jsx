import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  getFirm, getFirmContacts, updateContact, updateFirmStatus, getSettings,
} from '../api'
import StatusBadge from '../components/StatusBadge'

// ── Tooltip ────────────────────────────────────────────────────────────────────
function Tooltip({ text, children }) {
  const [visible, setVisible] = useState(false)
  return (
    <span className="relative inline-block"
      onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
      {children}
      {visible && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 px-3 py-2
          text-xs text-white bg-qnavy-800 rounded-lg shadow-lg leading-snug pointer-events-none">
          {text}
        </span>
      )}
    </span>
  )
}

// ── Single contact row in the Available tab ────────────────────────────────────
function AvailableContactRow({ contact, onToggle, nonDynamoSelectedCount, maxContacts }) {
  const [saving, setSaving] = useState(false)
  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ')
  const isSelected = contact.is_selected === 1
  const isDynamo = contact.source === 'dynamo'

  // Dynamo contacts are auto-accepted — always shown as selected, cap doesn't apply
  // Cap only applies to non-Dynamo contacts
  const atCap = !isDynamo && nonDynamoSelectedCount >= maxContacts && !isSelected

  async function handleSelect() {
    if (isDynamo) return  // Dynamo contacts are auto-accepted, not manually toggled
    setSaving(true)
    try { await onToggle(contact.id, isSelected ? 0 : 1) }
    finally { setSaving(false) }
  }

  return (
    <tr className={`border-b transition-colors
      ${isSelected || isDynamo
        ? 'border-qnavy-100 bg-qnavy-50/40 hover:bg-qnavy-50'
        : 'border-qgray-100 hover:bg-qgray-50'}`}>

      {/* Name / Title */}
      <td className="px-4 py-3">
        <div className="font-medium text-sm text-qgray-900">{fullName || <span className="text-qgray-400">—</span>}</div>
        {contact.job_title && <div className="text-xs text-qgray-500 mt-0.5">{contact.job_title}</div>}
      </td>

      {/* Source */}
      <td className="px-4 py-3">
        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border
          ${isDynamo ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-sky-50 text-sky-700 border-sky-200'}`}>
          {isDynamo ? 'Dynamo' : 'Preqin'}
        </span>
        {isDynamo && (
          <span className="ml-1.5 text-2xs text-purple-500 font-medium">auto</span>
        )}
      </td>

      {/* Email icon */}
      <td className="px-4 py-3 text-center">
        {contact.email
          ? <Tooltip text={contact.email}>
              <a href={`mailto:${contact.email}`} onClick={e => e.stopPropagation()}
                 className="inline-flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity">
                <img src="/email.svg" alt="Email" className="w-5 h-5 object-contain" style={{ filter: 'invert(24%) sepia(49%) saturate(573%) hue-rotate(186deg) brightness(90%) contrast(95%)' }} />
              </a>
            </Tooltip>
          : <span className="text-qgray-200">—</span>}
      </td>

      {/* LinkedIn icon */}
      <td className="px-4 py-3 text-center">
        {contact.linkedin_url
          ? <Tooltip text="View LinkedIn profile">
              <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer"
                 onClick={e => e.stopPropagation()}
                 className="inline-flex items-center justify-center opacity-70 hover:opacity-100 transition-opacity">
                <img src="/linkedin.svg" alt="LinkedIn" className="w-5 h-5 object-contain" />
              </a>
            </Tooltip>
          : <span className="text-qgray-200">—</span>}
      </td>

      {/* Score */}
      <td className="px-4 py-3 text-center">
        {contact.filter_score != null ? (
          <Tooltip text="Advisory score (0–100) based on seniority and role match.">
            <span className={`text-sm font-semibold cursor-default
              ${contact.filter_score >= 80 ? 'text-qteal-700'
                : contact.filter_score >= 60 ? 'text-amber-600' : 'text-qgray-500'}`}>
              {contact.filter_score}
            </span>
          </Tooltip>
        ) : <span className="text-qgray-300 text-sm">—</span>}
      </td>

      {/* Shortlist action */}
      <td className="px-4 py-3 text-right">
        {isDynamo ? (
          <Tooltip text="Dynamo contacts are automatically included — they don't count toward the cap.">
            <span className="text-xs px-3 py-1.5 rounded border border-purple-200 bg-purple-50 text-purple-700 font-medium cursor-default whitespace-nowrap">
              ✓ Auto-accepted
            </span>
          </Tooltip>
        ) : isSelected ? (
          <button
            onClick={handleSelect}
            disabled={saving}
            className="text-xs px-3 py-1.5 rounded border border-qnavy-300 bg-qnavy-700 text-white font-medium hover:bg-qnavy-800 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {saving ? '…' : '✓ Shortlisted'}
          </button>
        ) : (
          <Tooltip text={atCap ? `Cap of ${maxContacts} reached — remove another first.` : 'Add to shortlist'}>
            <button
              onClick={handleSelect}
              disabled={saving || atCap}
              className={`text-xs px-3 py-1.5 rounded border font-medium transition-colors disabled:opacity-40 whitespace-nowrap
                ${atCap
                  ? 'border-qgray-200 text-qgray-300 cursor-not-allowed'
                  : 'border-qgray-300 text-qgray-600 hover:border-qnavy-400 hover:text-qnavy-700 hover:bg-qnavy-50'}`}
            >
              {saving ? '…' : '+ Shortlist'}
            </button>
          </Tooltip>
        )}
      </td>
    </tr>
  )
}

// ── Contact row in the Under Review tab ───────────────────────────────────────
function PendingContactRow({ contact, onStatusChange }) {
  const [saving, setSaving] = useState(false)
  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ')

  async function handleStatus(status) {
    setSaving(true)
    try { await onStatusChange(contact.id, status) }
    finally { setSaving(false) }
  }

  return (
    <tr className="border-b border-qgray-100 hover:bg-qgray-50">
      <td className="px-4 py-3">
        <div className="font-medium text-sm text-qgray-900">{fullName || <span className="text-qgray-400">—</span>}</div>
        {contact.job_title && <div className="text-xs text-qgray-500 mt-0.5">{contact.job_title}</div>}
      </td>
      <td className="px-4 py-3 text-sm text-qgray-600">
        {contact.email || <span className="text-qgray-300">No email</span>}
      </td>
      <td className="px-4 py-3 text-xs text-qgray-500">{contact.role_tags || '—'}</td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <button onClick={() => handleStatus('approved')} disabled={saving}
            className="text-xs px-2.5 py-1.5 bg-qteal-600 text-white rounded hover:bg-qteal-700 transition-colors disabled:opacity-50 font-medium">
            Approve
          </button>
          <button onClick={() => handleStatus('blacklisted')} disabled={saving}
            className="text-xs px-2.5 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded hover:bg-red-100 transition-colors disabled:opacity-50">
            Exclude
          </button>
        </div>
      </td>
    </tr>
  )
}


// ── Date formatter ─────────────────────────────────────────────────────────────
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

// ── Main FirmDetail page ───────────────────────────────────────────────────────
export default function FirmDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [firm, setFirm]         = useState(null)
  const [contacts, setContacts] = useState([])
  const [tab, setTab]           = useState('available')
  const [loading, setLoading]   = useState(true)
  const [statusSaving, setStatusSaving] = useState(false)
  const [maxContacts, setMaxContacts] = useState(5)

  // Filters / sort for Available tab
  const [titleFilter, setTitleFilter] = useState('')
  const [sortField, setSortField]     = useState('score')
  const [sortDir, setSortDir]         = useState('desc')

  function toggleSort(field) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir(field === 'score' ? 'desc' : 'asc') }
  }

  useEffect(() => {
    Promise.all([
      getFirm(id),
      getFirmContacts(id),
      getSettings(),
    ]).then(([f, c, s]) => {
      setFirm(f)
      setContacts(c)
      if (s.max_contacts_per_firm) setMaxContacts(parseInt(s.max_contacts_per_firm, 10))
    }).catch(err => {
      if (err.message.includes('404')) navigate('/firms')
    }).finally(() => setLoading(false))
  }, [id])

  // Split contacts into the two UI tabs
  const availableContacts = useMemo(() =>
    contacts.filter(c => c.filter_status === 'approved' || c.filter_status === 'dynamo'),
    [contacts])

  const pendingContacts = useMemo(() =>
    contacts.filter(c => c.filter_status === 'pending_review'),
    [contacts])

  // Sort helper for Available tab
  function sortContacts(list, field, dir) {
    return [...list].sort((a, b) => {
      let av, bv
      if (field === 'score')  { av = a.filter_score ?? -1; bv = b.filter_score ?? -1 }
      else if (field === 'name') { av = (a.last_name || '').toLowerCase(); bv = (b.last_name || '').toLowerCase() }
      else if (field === 'source') { av = a.source; bv = b.source }
      else return 0
      if (av < bv) return dir === 'asc' ? -1 : 1
      if (av > bv) return dir === 'asc' ? 1 : -1
      return 0
    })
  }

  // Apply title filter + sort — Dynamo contacts float to top, then selected, then rest
  const { filteredDynamo, filteredSelected, filteredUnselected } = useMemo(() => {
    let list = availableContacts
    if (titleFilter.trim()) {
      const q = titleFilter.toLowerCase()
      list = list.filter(c => (c.job_title || '').toLowerCase().includes(q) ||
                               (c.first_name + ' ' + c.last_name).toLowerCase().includes(q))
    }
    const dynamo = sortContacts(list.filter(c => c.source === 'dynamo'), sortField, sortDir)
    const sel    = sortContacts(list.filter(c => c.source !== 'dynamo' && c.is_selected === 1), sortField, sortDir)
    const unsel  = sortContacts(list.filter(c => c.source !== 'dynamo' && c.is_selected !== 1), sortField, sortDir)
    return { filteredDynamo: dynamo, filteredSelected: sel, filteredUnselected: unsel }
  }, [availableContacts, titleFilter, sortField, sortDir])

  const filteredAvailable = useMemo(
    () => [...filteredDynamo, ...filteredSelected, ...filteredUnselected],
    [filteredDynamo, filteredSelected, filteredUnselected]
  )

  // Total selected count for display (all sources)
  const totalSelectedCount = useMemo(() =>
    contacts.filter(c => c.is_selected === 1).length, [contacts])

  // Dynamo selected count (auto-accepted, outside cap)
  const dynamoSelectedCount = useMemo(() =>
    contacts.filter(c => c.is_selected === 1 && c.source === 'dynamo').length, [contacts])

  // Non-Dynamo selected count (counts toward cap)
  const nonDynamoSelectedCount = useMemo(() =>
    contacts.filter(c => c.is_selected === 1 && c.source !== 'dynamo').length, [contacts])

  const remainingSlots = Math.max(0, maxContacts - nonDynamoSelectedCount)

  async function handleToggle(contactId, value) {
    await updateContact(contactId, { is_selected: value })
    setContacts(cs => cs.map(c => c.id === contactId ? { ...c, is_selected: value } : c))
    if (value === 1 && firm?.workflow_status === 'unreviewed') {
      setFirm(f => ({ ...f, workflow_status: 'in_progress' }))
    }
  }

  async function handleStatusChange(contactId, status) {
    await updateContact(contactId, { filter_status: status })
    setContacts(cs => cs.map(c => c.id === contactId ? { ...c, filter_status: status } : c))
  }

  async function handleMarkComplete() {
    setStatusSaving(true)
    try {
      await updateFirmStatus(id, 'complete')
      setFirm(f => ({ ...f, workflow_status: 'complete', review_reason: null }))
    } catch (e) {
      alert('Error: ' + e.message)
    } finally {
      setStatusSaving(false)
    }
  }

  async function handleReopen() {
    setStatusSaving(true)
    try {
      await updateFirmStatus(id, 'in_progress')
      setFirm(f => ({ ...f, workflow_status: 'in_progress', workflow_completed_at: null }))
    } catch (e) {
      alert('Error: ' + e.message)
    } finally {
      setStatusSaving(false)
    }
  }

  if (loading) return <div className="text-center py-20 text-qgray-400">Loading…</div>
  if (!firm)   return null

  const isComplete       = firm.workflow_status === 'complete'
  const needsAttention   = firm.workflow_status === 'needs_attention'

  return (
    <div className="space-y-5 w-full">

      {/* Back */}
      <button onClick={() => navigate('/firms')}
        className="text-sm text-qgray-500 hover:text-qnavy-700 flex items-center gap-1 font-medium transition-colors">
        ← Back to firms
      </button>

      {/* Needs Attention banner */}
      {needsAttention && firm.review_reason && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <span className="text-amber-500 text-lg mt-0.5 flex-shrink-0">⚠</span>
          <div>
            <p className="text-sm font-semibold text-amber-800">This firm needs attention.</p>
            <p className="text-sm text-amber-700 mt-0.5">{firm.review_reason}</p>
            <p className="text-xs text-amber-600 mt-1">Review your selections below and mark complete when satisfied.</p>
          </div>
        </div>
      )}

      {/* Firm header */}
      <div className="card px-5 py-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold text-qgray-900">
                {firm.display_name || firm.lp_name}
              </h1>
              <StatusBadge status={firm.workflow_status} />
            </div>
            <div className="flex items-center gap-2 mt-1.5 text-sm text-qgray-500 flex-wrap">
              {firm.institution_type && <span>{firm.institution_type}</span>}
              {firm.city     && <><span className="text-qgray-300">·</span><span>{firm.city}</span></>}
              {firm.country  && <><span className="text-qgray-300">·</span><span>{firm.country}</span></>}
              {firm.region   && !firm.country && <><span className="text-qgray-300">·</span><span>{firm.region}</span></>}
              {firm.aum_usd_mn && (
                <><span className="text-qgray-300">·</span><span>AUM: ${(firm.aum_usd_mn / 1000).toFixed(1)}B</span></>
              )}
              {firm.last_activity_date && (
                <><span className="text-qgray-300">·</span>
                <Tooltip text="Last outreach date recorded in Dynamo.">
                  <span className="cursor-default">Last activity: {firm.last_activity_date}</span>
                </Tooltip></>
              )}
            </div>

            {/* Firm IDs */}
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {firm.preqin_firm_id && (
                <Tooltip text="Preqin Firm ID — use this to look up the firm directly in Preqin.">
                  <span className="inline-flex items-center gap-1.5 cursor-default">
                    <span className="text-2xs font-semibold text-qgray-400 uppercase tracking-wider">Preqin ID</span>
                    <span className="font-bold text-sm text-qgreen-700 bg-qgreen-50 border border-qgreen-300 px-2 py-0.5 rounded-md tracking-wide">
                      {firm.preqin_firm_id}
                    </span>
                  </span>
                </Tooltip>
              )}
              {firm.dynamo_internal_id && (
                <Tooltip text={`Dynamo Internal ID: ${firm.dynamo_internal_id}`}>
                  <span className="inline-flex items-center gap-1.5 cursor-default">
                    <span className="text-2xs font-semibold text-qgray-400 uppercase tracking-wider">Dynamo ID</span>
                    <span className="font-mono text-xs text-qgray-500 bg-qgray-100 border border-qgray-200 px-2 py-0.5 rounded-md max-w-[14rem] truncate inline-block">
                      {firm.dynamo_internal_id}
                    </span>
                  </span>
                </Tooltip>
              )}
              {firm.workflow_completed_at && (
                <Tooltip text={`Last marked complete: ${new Date(firm.workflow_completed_at).toLocaleString()}`}>
                  <span className="inline-flex items-center gap-1.5 cursor-default">
                    <span className="text-2xs font-semibold text-qgray-400 uppercase tracking-wider">Last Reviewed</span>
                    <span className="text-xs text-qgray-600 bg-qgray-100 border border-qgray-200 px-2 py-0.5 rounded-md">
                      {formatReviewed(firm.workflow_completed_at)}
                    </span>
                  </span>
                </Tooltip>
              )}
            </div>
          </div>

          {/* Shortlist counter + action */}
          <div className="flex items-center gap-5 flex-shrink-0">
            {/* Counter — shows both dynamo and capped counts */}
            <div className="text-right">
              <Tooltip text={`${nonDynamoSelectedCount} manually shortlisted of ${maxContacts} cap · ${dynamoSelectedCount} Dynamo auto-accepted (not capped)`}>
                <div className="cursor-default">
                  <div className="flex items-baseline gap-1 justify-end">
                    <span className="text-2xl font-semibold text-qnavy-800">{nonDynamoSelectedCount}</span>
                    <span className="text-qgray-400 text-base font-medium">/ {maxContacts}</span>
                  </div>
                  <div className="text-xs text-qgray-500 mt-0.5 text-right">
                    shortlisted
                    {dynamoSelectedCount > 0 && (
                      <span className="ml-1.5 text-purple-600 font-medium">+{dynamoSelectedCount} Dynamo</span>
                    )}
                  </div>
                </div>
              </Tooltip>
            </div>

            {isComplete ? (
              <button
                onClick={handleReopen}
                disabled={statusSaving}
                className="btn-secondary"
              >
                {statusSaving ? 'Saving…' : 'Reopen'}
              </button>
            ) : (
              <button
                onClick={handleMarkComplete}
                disabled={statusSaving}
                className="btn-primary"
              >
                {statusSaving ? 'Saving…' : 'Mark Complete ✓'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Contacts card */}
      <div className="card overflow-hidden">

        {/* Tab bar */}
        <div className="border-b border-qgray-200 px-4 flex items-center gap-0 bg-qgray-50">
          <button
            onClick={() => setTab('available')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
              ${tab === 'available'
                ? 'border-qnavy-700 text-qnavy-800'
                : 'border-transparent text-qgray-500 hover:text-qgray-700'}`}
          >
            Available contacts
            {availableContacts.length > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded text-xs
                ${tab === 'available' ? 'bg-qnavy-100 text-qnavy-700' : 'bg-qgray-100 text-qgray-600'}`}>
                {availableContacts.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setTab('pending')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
              ${tab === 'pending'
                ? 'border-amber-500 text-amber-700'
                : 'border-transparent text-qgray-500 hover:text-qgray-700'}`}
          >
            Under Review
            {pendingContacts.length > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded text-xs
                ${tab === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-qgray-100 text-qgray-600'}`}>
                {pendingContacts.length}
              </span>
            )}
          </button>
        </div>

        {/* Available tab content */}
        {tab === 'available' && (
          <>
            {/* Filter bar */}
            <div className="px-4 py-2.5 border-b border-qgray-100 flex items-center gap-3 bg-white">
              <input
                type="search"
                placeholder="Filter by name or title…"
                value={titleFilter}
                onChange={e => setTitleFilter(e.target.value)}
                className="input text-sm py-1.5 flex-1 max-w-64"
              />
              <div className="flex items-center gap-3 ml-auto text-xs text-qgray-400">
                {filteredDynamo.length > 0 && (
                  <span className="font-medium text-purple-600 bg-purple-50 border border-purple-100 px-2 py-1 rounded">
                    {filteredDynamo.length} Dynamo (auto)
                  </span>
                )}
                {filteredSelected.length > 0 && (
                  <span className="font-medium text-qnavy-700 bg-qnavy-50 border border-qnavy-100 px-2 py-1 rounded">
                    {filteredSelected.length} shortlisted
                  </span>
                )}
                <span>{filteredAvailable.length} of {availableContacts.length} shown</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-qgray-50 border-b border-qgray-200">
                    <th className="px-4 py-2.5 text-left">
                      <button onClick={() => toggleSort('name')}
                        className={`flex items-center gap-1 font-semibold text-2xs uppercase tracking-wider
                          ${sortField === 'name' ? 'text-qnavy-800' : 'text-qgray-500 hover:text-qgray-700'}`}>
                        Name / Title
                        <span className="text-qgray-400">{sortField === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
                      </button>
                    </th>
                    <th className="px-4 py-2.5 text-left">
                      <button onClick={() => toggleSort('source')}
                        className={`flex items-center gap-1 font-semibold text-2xs uppercase tracking-wider
                          ${sortField === 'source' ? 'text-qnavy-800' : 'text-qgray-500 hover:text-qgray-700'}`}>
                        Source
                        <span className="text-qgray-400">{sortField === 'source' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
                      </button>
                    </th>
                    <th className="px-4 py-2.5 text-center font-semibold text-2xs uppercase tracking-wider text-qgray-500 w-10">Email</th>
                    <th className="px-4 py-2.5 text-center font-semibold text-2xs uppercase tracking-wider text-qgray-500 w-10">LinkedIn</th>
                    <th className="px-4 py-2.5 text-center">
                      <Tooltip text="Advisory score (0–100) based on seniority and role match. Never auto-selects.">
                        <button onClick={() => toggleSort('score')}
                          className={`flex items-center gap-1 font-semibold text-2xs uppercase tracking-wider mx-auto
                            ${sortField === 'score' ? 'text-qnavy-800' : 'text-qgray-500 hover:text-qgray-700'}`}>
                          Score
                          <span className="text-qgray-400">{sortField === 'score' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
                        </button>
                      </Tooltip>
                    </th>
                    <th className="px-4 py-2.5 w-36"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAvailable.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-qgray-400 text-sm">
                        {availableContacts.length === 0
                          ? 'No available contacts for this firm.'
                          : 'No contacts match your filter.'}
                      </td>
                    </tr>
                  ) : (
                    <>
                      {/* Dynamo contacts — always at top, auto-accepted */}
                      {filteredDynamo.length > 0 && (
                        <>
                          <tr>
                            <td colSpan={6} className="px-4 py-1.5 bg-purple-50 border-b border-purple-100">
                              <span className="text-2xs font-semibold text-purple-700 uppercase tracking-wider">
                                Dynamo — Auto-accepted · {filteredDynamo.length}
                              </span>
                            </td>
                          </tr>
                          {filteredDynamo.map(c => (
                            <AvailableContactRow key={c.id} contact={c} onToggle={handleToggle}
                              nonDynamoSelectedCount={nonDynamoSelectedCount} maxContacts={maxContacts} />
                          ))}
                        </>
                      )}

                      {/* Manually shortlisted non-Dynamo contacts */}
                      {filteredSelected.length > 0 && (
                        <>
                          <tr>
                            <td colSpan={6} className="px-4 py-1.5 bg-qnavy-50 border-b border-qnavy-100">
                              <span className="text-2xs font-semibold text-qnavy-700 uppercase tracking-wider">
                                Shortlisted · {filteredSelected.length} / {maxContacts}
                              </span>
                            </td>
                          </tr>
                          {filteredSelected.map(c => (
                            <AvailableContactRow key={c.id} contact={c} onToggle={handleToggle}
                              nonDynamoSelectedCount={nonDynamoSelectedCount} maxContacts={maxContacts} />
                          ))}
                        </>
                      )}

                      {/* Remaining available contacts */}
                      {filteredUnselected.length > 0 && (
                        <>
                          {(filteredDynamo.length > 0 || filteredSelected.length > 0) && (
                            <tr>
                              <td colSpan={6} className="px-4 py-1.5 bg-qgray-50 border-b border-qgray-100">
                                <span className="text-2xs font-semibold text-qgray-400 uppercase tracking-wider">
                                  Available · {filteredUnselected.length}
                                  {remainingSlots > 0
                                    ? ` · ${remainingSlots} slot${remainingSlots !== 1 ? 's' : ''} remaining`
                                    : ' · Cap reached'}
                                </span>
                              </td>
                            </tr>
                          )}
                          {filteredUnselected.map(c => (
                            <AvailableContactRow key={c.id} contact={c} onToggle={handleToggle}
                              nonDynamoSelectedCount={nonDynamoSelectedCount} maxContacts={maxContacts} />
                          ))}
                        </>
                      )}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Under Review tab content */}
        {tab === 'pending' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-qgray-50 border-b border-qgray-200">
                  <th className="px-4 py-2.5 text-left font-semibold text-2xs uppercase tracking-wider text-qgray-500">Name / Title</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-2xs uppercase tracking-wider text-qgray-500">Email</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-2xs uppercase tracking-wider text-qgray-500">Role tags</th>
                  <th className="px-4 py-2.5 font-semibold text-2xs uppercase tracking-wider text-qgray-500">Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingContacts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-10 text-qgray-400 text-sm">
                      No contacts pending review for this firm.
                    </td>
                  </tr>
                ) : pendingContacts.map(c => (
                  <PendingContactRow
                    key={c.id}
                    contact={c}
                    onStatusChange={handleStatusChange}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}
