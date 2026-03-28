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
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-56 px-3 py-2
          text-xs text-white bg-gray-800 rounded shadow-lg leading-snug pointer-events-none">
          {text}
        </span>
      )}
    </span>
  )
}

// ── Single contact row in the Available tab ────────────────────────────────────
function AvailableContactRow({ contact, onToggle, selectedCount, maxContacts }) {
  const [saving, setSaving] = useState(false)
  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ')
  const isSelected = contact.is_selected === 1
  const atCap = selectedCount >= maxContacts && !isSelected

  async function handleSelect() {
    setSaving(true)
    try { await onToggle(contact.id, isSelected ? 0 : 1) }
    finally { setSaving(false) }
  }

  return (
    <tr className={`border-b transition-colors
      ${isSelected
        ? 'border-blue-100 bg-blue-50 hover:bg-blue-100'
        : 'border-gray-100 hover:bg-gray-50'}`}>

      {/* Name / Title */}
      <td className="px-4 py-3">
        <div className="font-medium text-sm text-gray-900">{fullName || <span className="text-gray-400">—</span>}</div>
        {contact.job_title && <div className="text-xs text-gray-500 mt-0.5">{contact.job_title}</div>}
      </td>

      {/* Source */}
      <td className="px-4 py-3">
        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium
          ${contact.source === 'dynamo' ? 'bg-purple-100 text-purple-700' : 'bg-sky-100 text-sky-700'}`}>
          {contact.source === 'dynamo' ? 'Dynamo' : 'Preqin'}
        </span>
      </td>

      {/* Email icon */}
      <td className="px-4 py-3 text-center">
        {contact.email
          ? <Tooltip text={contact.email}>
              <a href={`mailto:${contact.email}`} onClick={e => e.stopPropagation()}
                 className="inline-flex items-center justify-center opacity-70 hover:opacity-100 transition-opacity">
                <img src="/email.webp" alt="Email" className="w-5 h-5 object-contain" />
              </a>
            </Tooltip>
          : <span className="text-gray-200">—</span>}
      </td>

      {/* LinkedIn icon */}
      <td className="px-4 py-3 text-center">
        {contact.linkedin_url
          ? <Tooltip text="View LinkedIn profile">
              <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer"
                 onClick={e => e.stopPropagation()}
                 className="inline-flex items-center justify-center opacity-70 hover:opacity-100 transition-opacity">
                <img src="/linkedin.webp" alt="LinkedIn" className="w-5 h-5 object-contain" />
              </a>
            </Tooltip>
          : <span className="text-gray-200">—</span>}
      </td>

      {/* Score */}
      <td className="px-4 py-3 text-center">
        {contact.filter_score != null ? (
          <Tooltip text="Advisory score based on seniority and role match. Does not auto-select contacts.">
            <span className={`text-sm font-semibold cursor-default
              ${contact.filter_score >= 80 ? 'text-green-600'
                : contact.filter_score >= 60 ? 'text-yellow-600' : 'text-gray-500'}`}>
              {contact.filter_score}
            </span>
          </Tooltip>
        ) : <span className="text-gray-300 text-sm">—</span>}
      </td>

      {/* Shortlist action */}
      <td className="px-4 py-3 text-right">
        {isSelected ? (
          <button
            onClick={handleSelect}
            disabled={saving}
            className="text-xs px-3 py-1.5 rounded border border-blue-300 bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 whitespace-nowrap"
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
                  ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                  : 'border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50'}`}
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
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="px-4 py-3">
        <div className="font-medium text-sm text-gray-900">{fullName || <span className="text-gray-400">—</span>}</div>
        {contact.job_title && <div className="text-xs text-gray-500 mt-0.5">{contact.job_title}</div>}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {contact.email || <span className="text-gray-300">No email</span>}
      </td>
      <td className="px-4 py-3 text-xs text-gray-500">{contact.role_tags || '—'}</td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <button onClick={() => handleStatus('approved')} disabled={saving}
            className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors">
            Approve
          </button>
          <button onClick={() => handleStatus('blacklisted')} disabled={saving}
            className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors">
            Blacklist
          </button>
        </div>
      </td>
    </tr>
  )
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

  // Apply title filter + sort to Available tab — selected always floated to top
  const { filteredSelected, filteredUnselected } = useMemo(() => {
    let list = availableContacts
    if (titleFilter.trim()) {
      const q = titleFilter.toLowerCase()
      list = list.filter(c => (c.job_title || '').toLowerCase().includes(q) ||
                               (c.first_name + ' ' + c.last_name).toLowerCase().includes(q))
    }
    const sel   = sortContacts(list.filter(c => c.is_selected === 1), sortField, sortDir)
    const unsel = sortContacts(list.filter(c => c.is_selected !== 1), sortField, sortDir)
    return { filteredSelected: sel, filteredUnselected: unsel }
  }, [availableContacts, titleFilter, sortField, sortDir])

  const filteredAvailable = useMemo(
    () => [...filteredSelected, ...filteredUnselected],
    [filteredSelected, filteredUnselected]
  )

  const selectedCount = useMemo(() =>
    contacts.filter(c => c.is_selected === 1).length, [contacts])

  async function handleToggle(contactId, value) {
    await updateContact(contactId, { is_selected: value })
    setContacts(cs => cs.map(c => c.id === contactId ? { ...c, is_selected: value } : c))
    // If this was the first selection, reflect in_progress locally
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

  if (loading) return <div className="text-center py-20 text-gray-400">Loading…</div>
  if (!firm)   return null

  const isComplete       = firm.workflow_status === 'complete'
  const needsAttention   = firm.workflow_status === 'needs_attention'
  const remainingSlots   = Math.max(0, maxContacts - selectedCount)

  return (
    <div className="space-y-5 max-w-5xl">

      {/* Back */}
      <button onClick={() => navigate('/firms')}
        className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
        ← Back to firms
      </button>

      {/* Needs Attention banner */}
      {needsAttention && firm.review_reason && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-3">
          <span className="text-amber-500 text-lg mt-0.5">⚠</span>
          <div>
            <p className="text-sm font-semibold text-amber-800">This firm needs attention.</p>
            <p className="text-sm text-amber-700 mt-0.5">{firm.review_reason}</p>
            <p className="text-xs text-amber-600 mt-1">Review your selections below and mark complete when satisfied.</p>
          </div>
        </div>
      )}

      {/* Firm header */}
      <div className="bg-white border border-gray-200 rounded-lg px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold text-gray-900">
                {firm.display_name || firm.lp_name}
              </h1>
              <StatusBadge status={firm.workflow_status} />
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-sm text-gray-500 flex-wrap">
              {firm.institution_type && <span>{firm.institution_type}</span>}
              {firm.country && <><span>·</span><span>{firm.country}</span></>}
              {firm.region  && <><span>·</span><span>{firm.region}</span></>}
              {firm.aum_usd_mn && (
                <><span>·</span><span>AUM: ${(firm.aum_usd_mn / 1000).toFixed(1)}B</span></>
              )}
              {firm.last_activity_date && (
                <><span>·</span>
                <Tooltip text="Last outreach date recorded in Dynamo.">
                  <span className="cursor-default">Last activity: {firm.last_activity_date}</span>
                </Tooltip></>
              )}
            </div>
          </div>

          {/* Shortlist counter + action button */}
          <div className="flex items-center gap-4 flex-shrink-0">
            <Tooltip text={`${selectedCount} shortlisted · ${remainingSlots} slot${remainingSlots !== 1 ? 's' : ''} remaining (cap: ${maxContacts})`}>
              <div className="text-right cursor-default">
                <div className="text-2xl font-semibold text-blue-700">{selectedCount} / {maxContacts}</div>
                <div className="text-xs text-gray-500">shortlisted</div>
              </div>
            </Tooltip>

            {isComplete ? (
              <button
                onClick={handleReopen}
                disabled={statusSaving}
                className="btn-secondary text-sm px-4 py-2 whitespace-nowrap"
              >
                {statusSaving ? 'Saving…' : 'Reopen'}
              </button>
            ) : (
              <button
                onClick={handleMarkComplete}
                disabled={statusSaving}
                className="btn-primary text-sm px-4 py-2 whitespace-nowrap"
              >
                {statusSaving ? 'Saving…' : 'Mark Complete ✓'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Contacts card */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">

        {/* Tab bar */}
        <div className="border-b border-gray-200 px-4 flex items-center gap-0">
          {/* Available tab */}
          <button
            onClick={() => setTab('available')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
              ${tab === 'available'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Available
            {availableContacts.length > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs
                ${tab === 'available' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                {availableContacts.length}
              </span>
            )}
          </button>

          {/* Under Review tab */}
          <button
            onClick={() => setTab('pending')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
              ${tab === 'pending'
                ? 'border-amber-500 text-amber-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Under Review
            {pendingContacts.length > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs
                ${tab === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                {pendingContacts.length}
              </span>
            )}
          </button>
        </div>

        {/* Available tab content */}
        {tab === 'available' && (
          <>
            {/* Filter bar */}
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-3 bg-gray-50">
              <input
                type="search"
                placeholder="Filter by name or title…"
                value={titleFilter}
                onChange={e => setTitleFilter(e.target.value)}
                className="input text-sm py-1.5 flex-1 max-w-64"
              />
              {filteredSelected.length > 0 && (
                <span className="text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2 py-1 rounded">
                  {filteredSelected.length} shortlisted
                </span>
              )}
              <span className="text-xs text-gray-400 ml-auto">
                {filteredAvailable.length} of {availableContacts.length} shown
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white border-b border-gray-200">
                    <th className="px-4 py-2 text-left">
                      <button onClick={() => toggleSort('name')}
                        className={`flex items-center gap-1 font-medium text-xs uppercase tracking-wide
                          ${sortField === 'name' ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                        Name / Title
                        <span className="text-gray-400">{sortField === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
                      </button>
                    </th>
                    <th className="px-4 py-2 text-left">
                      <button onClick={() => toggleSort('source')}
                        className={`flex items-center gap-1 font-medium text-xs uppercase tracking-wide
                          ${sortField === 'source' ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                        Source
                        <span className="text-gray-400">{sortField === 'source' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
                      </button>
                    </th>
                    <th className="px-4 py-2 text-center font-medium text-xs uppercase tracking-wide text-gray-500 w-10">Email</th>
                    <th className="px-4 py-2 text-center font-medium text-xs uppercase tracking-wide text-gray-500 w-10">LinkedIn</th>
                    <th className="px-4 py-2 text-center">
                      <Tooltip text="Advisory score (0–100) based on seniority and role match. Never auto-selects.">
                        <button onClick={() => toggleSort('score')}
                          className={`flex items-center gap-1 font-medium text-xs uppercase tracking-wide mx-auto
                            ${sortField === 'score' ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                          Score
                          <span className="text-gray-400">{sortField === 'score' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
                        </button>
                      </Tooltip>
                    </th>
                    <th className="px-4 py-2 w-28"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAvailable.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-gray-400 text-sm">
                        {availableContacts.length === 0
                          ? 'No available contacts for this firm.'
                          : 'No contacts match your filter.'}
                      </td>
                    </tr>
                  ) : (
                    <>
                      {/* Selected contacts — pinned to top */}
                      {filteredSelected.length > 0 && (
                        <>
                          <tr>
                            <td colSpan={6} className="px-4 py-1.5 bg-blue-50 border-b border-blue-100">
                              <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                                Shortlisted · {filteredSelected.length}
                              </span>
                            </td>
                          </tr>
                          {filteredSelected.map(c => (
                            <AvailableContactRow key={c.id} contact={c} onToggle={handleToggle}
                              selectedCount={selectedCount} maxContacts={maxContacts} />
                          ))}
                        </>
                      )}

                      {/* Unselected contacts */}
                      {filteredUnselected.length > 0 && (
                        <>
                          {filteredSelected.length > 0 && (
                            <tr>
                              <td colSpan={6} className="px-4 py-1.5 bg-gray-50 border-b border-gray-100">
                                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                                  Available · {filteredUnselected.length}
                                </span>
                              </td>
                            </tr>
                          )}
                          {filteredUnselected.map(c => (
                            <AvailableContactRow key={c.id} contact={c} onToggle={handleToggle}
                              selectedCount={selectedCount} maxContacts={maxContacts} />
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
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Name / Title</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Email</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Role tags</th>
                  <th className="px-4 py-2 font-medium text-gray-600">Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingContacts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-10 text-gray-400 text-sm">
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
