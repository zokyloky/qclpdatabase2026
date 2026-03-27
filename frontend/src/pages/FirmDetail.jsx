import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  getFirm, getFirmContacts, updateContact, updateFirmStatus,
  getOutreach, createOutreach, deleteOutreach, getSettings,
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
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      {/* Shortlist toggle */}
      <td className="px-4 py-3 w-10">
        <Tooltip text={
          atCap
            ? `You've reached the ${maxContacts}-contact cap. Remove another contact first.`
            : isSelected ? 'Remove from shortlist' : 'Add to shortlist'
        }>
          <button
            onClick={handleSelect}
            disabled={saving || atCap}
            className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors text-xs font-bold
              ${isSelected
                ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'
                : atCap
                  ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                  : 'border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500'}`}
          >
            {saving ? '…' : isSelected ? '✓' : '+'}
          </button>
        </Tooltip>
      </td>

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

      {/* Email */}
      <td className="px-4 py-3 text-sm text-gray-600">
        {contact.email
          ? <a href={`mailto:${contact.email}`} className="hover:text-blue-600 truncate block max-w-xs"
               onClick={e => e.stopPropagation()}>{contact.email}</a>
          : <span className="text-gray-300">No email</span>}
      </td>

      {/* LinkedIn */}
      <td className="px-4 py-3 text-sm">
        {contact.linkedin_url
          ? <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer"
               className="text-blue-600 hover:underline" onClick={e => e.stopPropagation()}>LinkedIn</a>
          : <span className="text-gray-300">—</span>}
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

// ── Outreach form ──────────────────────────────────────────────────────────────
function OutreachForm({ firmId, contacts, onAdded }) {
  const [form, setForm] = useState({
    lp_contact_id: '', outreach_date: new Date().toISOString().slice(0, 10),
    outreach_type: 'email', notes: '', logged_by: '',
  })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await createOutreach({ ...form, lp_firm_id: firmId, lp_contact_id: form.lp_contact_id || null })
      setForm(f => ({ ...f, notes: '', lp_contact_id: '' }))
      onAdded()
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const selected = contacts.filter(c => c.is_selected === 1)
  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
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
        <label className="block text-xs font-medium text-gray-600 mb-1">Contact (optional)</label>
        <select value={form.lp_contact_id}
          onChange={e => setForm(f => ({ ...f, lp_contact_id: e.target.value }))}
          className="select w-full text-sm">
          <option value="">Firm-level</option>
          {selected.map(c => (
            <option key={c.id} value={c.id}>
              {[c.first_name, c.last_name].filter(Boolean).join(' ')}
            </option>
          ))}
        </select>
      </div>
      <div className="col-span-2">
        <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
        <input type="text" value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          placeholder="Brief notes on this outreach…" className="input text-sm" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Logged by</label>
        <input type="text" value={form.logged_by}
          onChange={e => setForm(f => ({ ...f, logged_by: e.target.value }))}
          placeholder="Your name" className="input text-sm" />
      </div>
      <div className="col-span-full flex justify-end">
        <button type="submit" disabled={saving} className="btn-primary text-sm">
          {saving ? 'Saving…' : 'Log outreach'}
        </button>
      </div>
    </form>
  )
}

// ── Main FirmDetail page ───────────────────────────────────────────────────────
export default function FirmDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [firm, setFirm]         = useState(null)
  const [contacts, setContacts] = useState([])
  const [outreach, setOutreach] = useState([])
  const [tab, setTab]           = useState('available')
  const [loading, setLoading]   = useState(true)
  const [statusSaving, setStatusSaving] = useState(false)
  const [showOutreachForm, setShowOutreachForm] = useState(false)
  const [maxContacts, setMaxContacts] = useState(5)

  // Filters for Available tab
  const [titleFilter, setTitleFilter] = useState('')
  const [sortField, setSortField]     = useState('score')

  useEffect(() => {
    Promise.all([
      getFirm(id),
      getFirmContacts(id),
      getOutreach({ firm_id: id }),
      getSettings(),
    ]).then(([f, c, o, s]) => {
      setFirm(f)
      setContacts(c)
      setOutreach(o.entries || [])
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

  // Apply title filter + sort to Available tab
  const filteredAvailable = useMemo(() => {
    let list = availableContacts
    if (titleFilter.trim()) {
      const q = titleFilter.toLowerCase()
      list = list.filter(c => (c.job_title || '').toLowerCase().includes(q) ||
                               (c.first_name + ' ' + c.last_name).toLowerCase().includes(q))
    }
    if (sortField === 'score') {
      list = [...list].sort((a, b) => (b.filter_score ?? 0) - (a.filter_score ?? 0))
    } else if (sortField === 'name') {
      list = [...list].sort((a, b) =>
        (a.last_name || '').localeCompare(b.last_name || ''))
    } else if (sortField === 'source_dynamo') {
      list = [...list].sort((a, b) =>
        a.source === 'dynamo' ? -1 : b.source === 'dynamo' ? 1 : 0)
    }
    return list
  }, [availableContacts, titleFilter, sortField])

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

  async function refreshOutreach() {
    const data = await getOutreach({ firm_id: id })
    setOutreach(data.entries || [])
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
            {/* Filter + sort bar */}
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-3 bg-gray-50">
              <input
                type="search"
                placeholder="Filter by name or title…"
                value={titleFilter}
                onChange={e => setTitleFilter(e.target.value)}
                className="input text-sm py-1.5 flex-1 max-w-64"
              />
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span className="text-xs">Sort:</span>
                {[
                  { value: 'score',        label: 'Score ↓' },
                  { value: 'name',         label: 'Name A-Z' },
                  { value: 'source_dynamo', label: 'Dynamo first' },
                ].map(opt => (
                  <button key={opt.value}
                    onClick={() => setSortField(opt.value)}
                    className={`text-xs px-2 py-1 rounded border transition-colors
                      ${sortField === opt.value
                        ? 'border-blue-400 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
              <span className="text-xs text-gray-400 ml-auto">
                {filteredAvailable.length} of {availableContacts.length} shown
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white border-b border-gray-100">
                    <th className="px-4 py-2 w-10"></th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Name / Title</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Source</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Email</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">LinkedIn</th>
                    <th className="px-4 py-2 text-center font-medium text-gray-600">
                      <Tooltip text="Advisory score (0–100) based on seniority and role match. Never auto-selects.">
                        <span className="cursor-default">Score</span>
                      </Tooltip>
                    </th>
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
                  ) : filteredAvailable.map(c => (
                    <AvailableContactRow
                      key={c.id}
                      contact={c}
                      onToggle={handleToggle}
                      selectedCount={selectedCount}
                      maxContacts={maxContacts}
                    />
                  ))}
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

      {/* Outreach log */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">Outreach Log ({outreach.length})</h2>
          <button
            onClick={() => setShowOutreachForm(f => !f)}
            className="btn-secondary text-sm py-1.5"
          >
            {showOutreachForm ? 'Cancel' : '+ Log outreach'}
          </button>
        </div>

        {showOutreachForm && (
          <div className="mb-4 pb-4 border-b border-gray-100">
            <OutreachForm
              firmId={id}
              contacts={contacts}
              onAdded={() => { setShowOutreachForm(false); refreshOutreach() }}
            />
          </div>
        )}

        {outreach.length === 0 ? (
          <p className="text-sm text-gray-400">No outreach logged yet.</p>
        ) : (
          <div className="space-y-2">
            {outreach.map(entry => (
              <div key={entry.id}
                className="flex items-start justify-between text-sm py-2 border-b border-gray-50 last:border-0">
                <div className="flex items-start gap-3">
                  <span className="text-gray-400 text-xs whitespace-nowrap mt-0.5">{entry.outreach_date}</span>
                  <div>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 mr-2">
                      {entry.outreach_type}
                    </span>
                    {entry.contact_name && <span className="text-gray-700 font-medium mr-2">{entry.contact_name}</span>}
                    {entry.notes && <span className="text-gray-600">{entry.notes}</span>}
                    {entry.logged_by && <span className="text-gray-400 ml-2 text-xs">— {entry.logged_by}</span>}
                  </div>
                </div>
                <button
                  onClick={async () => {
                    if (!confirm('Delete this outreach entry?')) return
                    await deleteOutreach(entry.id)
                    setOutreach(os => os.filter(o => o.id !== entry.id))
                  }}
                  className="text-gray-300 hover:text-red-500 transition-colors text-xs ml-4 flex-shrink-0"
                >✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
