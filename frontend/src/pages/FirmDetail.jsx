import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import {
  getFirm, getFirmContacts, getFirms, updateContact, bulkUpdateContacts,
  updateFirmStatus, getSettings, getStats,
} from '../api'

// Module-level cache for prefetched firm data — persists across navigations within this session
const firmDataCache = new Map()
import StatusBadge from '../components/StatusBadge'
import Breadcrumb from '../components/Breadcrumb'

// ── Helpers ────────────────────────────────────────────────────────────────────
// Ensure a URL has a proper protocol prefix so it doesn't resolve relative to the app
function normalizeUrl(url) {
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  return 'https://' + url
}

// ── Inline icon components (no external file dependency) ──────────────────────
function EmailIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M2 7l10 7 10-7" />
    </svg>
  )
}

function LinkedInIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  )
}

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
function AvailableContactRow({
  contact, onToggle, onExclude, nonDynamoSelectedCount, maxContacts,
  isChecked, onCheck, onSelectAllByTitle,
}) {
  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ')
  const isSelected = contact.is_selected === 1
  const isDynamo = contact.source === 'dynamo'
  const [excluding, setExcluding] = useState(false)

  // Cap only applies to non-Dynamo contacts
  const atCap = !isDynamo && nonDynamoSelectedCount >= maxContacts && !isSelected

  function handleSelect() {
    if (isDynamo) return  // Dynamo contacts are auto-accepted, not manually toggled
    onToggle(contact.id, isSelected ? 0 : 1)
  }

  async function handleExclude(e) {
    e.stopPropagation()
    if (!onExclude) return
    setExcluding(true)
    try { await onExclude(contact.id) }
    finally { setExcluding(false) }
  }

  return (
    <tr className={`border-b transition-colors group
      ${isChecked
        ? 'bg-blue-50 border-blue-100'
        : isSelected || isDynamo
        ? 'border-qgreen-100 bg-qgreen-50/40 hover:bg-qgreen-50'
        : 'border-qgray-100 hover:bg-qgray-50'}`}>

      {/* Checkbox */}
      <td className="px-3 py-3 w-8">
        <input
          type="checkbox"
          checked={isChecked}
          onChange={e => { e.stopPropagation(); onCheck(contact.id) }}
          className="w-3.5 h-3.5 rounded border-qgray-300 text-qgreen-700 cursor-pointer accent-qgreen-700"
        />
      </td>

      {/* Name / Title */}
      <td className="px-4 py-3">
        <div className="font-medium text-sm text-qgray-900">{fullName || <span className="text-qgray-400">—</span>}</div>
        {contact.job_title && (
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs text-qgray-500">{contact.job_title}</span>
            {onSelectAllByTitle && contact.job_title && (
              <button
                onClick={e => { e.stopPropagation(); onSelectAllByTitle(contact.job_title) }}
                title={`Select all contacts with title "${contact.job_title}"`}
                className="opacity-0 group-hover:opacity-100 text-2xs text-qgray-400 hover:text-qgreen-700 border border-qgray-200 hover:border-qgreen-400 rounded px-1 py-0.5 transition-all whitespace-nowrap"
              >
                ⇑ all
              </button>
            )}
          </div>
        )}
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
                 className="inline-flex items-center justify-center text-qgray-400 hover:text-qgreen-700 transition-colors">
                <EmailIcon className="w-4 h-4" />
              </a>
            </Tooltip>
          : <span className="text-qgray-200">—</span>}
      </td>

      {/* LinkedIn icon */}
      <td className="px-4 py-3 text-center">
        {contact.linkedin_url
          ? <Tooltip text="View LinkedIn profile">
              <a href={normalizeUrl(contact.linkedin_url)} target="_blank" rel="noopener noreferrer"
                 onClick={e => e.stopPropagation()}
                 className="inline-flex items-center justify-center text-qgray-400 hover:text-[#0077B5] transition-colors">
                <LinkedInIcon className="w-4 h-4" />
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
        ) : (
          <div className="flex items-center justify-end gap-1.5">
            {isSelected ? (
              <button
                onClick={handleSelect}
                className="text-xs px-3 py-1.5 rounded border border-qgreen-600 bg-qgreen-700 text-white font-semibold hover:bg-qgreen-800 active:bg-qgreen-900 transition-colors whitespace-nowrap"
              >
                ✓ Shortlisted
              </button>
            ) : (
              <Tooltip text={atCap ? `Cap of ${maxContacts} reached — remove another first.` : 'Add to shortlist'}>
                <button
                  onClick={handleSelect}
                  disabled={atCap}
                  className={`text-xs px-3 py-1.5 rounded border font-medium transition-colors disabled:opacity-40 whitespace-nowrap
                    ${atCap
                      ? 'border-qgray-200 text-qgray-300 cursor-not-allowed'
                      : 'border-qgray-300 text-qgray-600 hover:border-qgreen-500 hover:text-qgreen-700 hover:bg-qgreen-50'}`}
                >
                  + Shortlist
                </button>
              </Tooltip>
            )}
            <Tooltip text="Exclude this contact — removes them from the available list permanently.">
              <button
                onClick={handleExclude}
                disabled={excluding}
                className="text-xs px-2 py-1.5 rounded border border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300 hover:text-red-700 transition-colors disabled:opacity-40 whitespace-nowrap"
              >
                {excluding ? '…' : 'Exclude'}
              </button>
            </Tooltip>
          </div>
        )}
      </td>
    </tr>
  )
}

// ── Contact row in the Under Review tab ───────────────────────────────────────
function PendingContactRow({ contact, onStatusChange, isChecked, onCheck }) {
  const [saving, setSaving] = useState(false)
  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ')

  async function handleStatus(status) {
    setSaving(true)
    try { await onStatusChange(contact.id, status) }
    finally { setSaving(false) }
  }

  return (
    <tr className={`border-b transition-colors
      ${isChecked ? 'bg-blue-50 border-blue-100' : 'border-qgray-100 hover:bg-qgray-50'}`}>
      {/* Checkbox */}
      <td className="px-3 py-3 w-8">
        <input
          type="checkbox"
          checked={isChecked}
          onChange={e => { e.stopPropagation(); onCheck(contact.id) }}
          className="w-3.5 h-3.5 rounded border-qgray-300 text-qgreen-700 cursor-pointer accent-qgreen-700"
        />
      </td>
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
            Reject
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
  const location = useLocation()

  const [firm, setFirm]         = useState(null)
  const [contacts, setContacts] = useState([])
  const [tab, setTab]           = useState('available')
  const [loading, setLoading]   = useState(true)
  const [statusSaving, setStatusSaving] = useState(false)
  const [maxContacts, setMaxContacts] = useState(5)

  // Filters / sort for Available tab
  const [titleFilter, setTitleFilter]       = useState('')
  const [emailFilter, setEmailFilter]       = useState(false)
  const [linkedinFilter, setLinkedinFilter] = useState(false)
  const [sortField, setSortField]           = useState('score')
  const [sortDir, setSortDir]               = useState('desc')

  // Multi-select state for bulk actions
  const [selectedForAction, setSelectedForAction] = useState(new Set())
  const [isBulkWorking, setIsBulkWorking] = useState(false)

  // Overall progress stats (fetched once on mount)
  const [stats, setStats] = useState(null)

  // Pre-fetch the next firm to review in the background so "Done" is instant
  const [nextFirm, setNextFirm] = useState(null)
  const [transitioning, setTransitioning] = useState(false)

  // Toast shown when arriving on this page right after saving the previous firm
  const [savedFlash, setSavedFlash] = useState(null)

  useEffect(() => {
    getStats().then(setStats).catch(console.error)
  }, [])

  // Show "saved" toast when arriving after marking a firm complete
  useEffect(() => {
    const savedName = location.state?.justSaved
    if (savedName) {
      setSavedFlash(savedName)
      setTimeout(() => setSavedFlash(null), 3000)
      // Clear from history state so a refresh doesn't re-show it
      window.history.replaceState({}, '')
    }
  }, [location.state?.justSaved])

  useEffect(() => {
    let cancelled = false
    async function prefetchNext() {
      const statusPriority = ['needs_attention', 'in_progress', 'unreviewed']
      const nextFirms = []

      for (const status of statusPriority) {
        if (cancelled || nextFirms.length >= 2) break
        try {
          const { firms: candidates } = await getFirms({
            workflow_status: status,
            per_page: 10,
            sort_by: 'workflow_priority',
            sort_dir: 'asc',
          })
          for (const f of candidates) {
            if (nextFirms.length >= 2) break
            if (
              String(f.id) !== String(id) &&
              (f.available_count > 0 || f.pending_count > 0) &&
              !nextFirms.find(n => n.id === f.id)
            ) {
              nextFirms.push(f)
            }
          }
        } catch { /* continue */ }
      }

      if (cancelled || nextFirms.length === 0) return

      // Set the primary next firm for the "Next:" hint
      setNextFirm(nextFirms[0])

      // Pre-fetch full data (firm + contacts) for the next 2 firms so navigation is instant
      for (const nextF of nextFirms) {
        const key = String(nextF.id)
        if (!firmDataCache.has(key)) {
          Promise.all([getFirm(nextF.id), getFirmContacts(nextF.id), getSettings()])
            .then(([f, c, s]) => {
              if (!cancelled) {
                firmDataCache.set(key, {
                  firm: f,
                  contacts: c,
                  maxContacts: s.max_contacts_per_firm ? parseInt(s.max_contacts_per_firm, 10) : 5,
                })
              }
            })
            .catch(() => {}) // Silent — prefetch is best-effort
        }
      }
    }
    prefetchNext()
    return () => { cancelled = true }
  }, [id])

  function toggleSort(field) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir(field === 'score' ? 'desc' : 'asc') }
  }

  useEffect(() => {
    // CRITICAL: always clear the Done overlay when arriving on any firm (incl. after navigation)
    setStatusSaving(false)
    setTransitioning(false)
    setNextFirm(null) // reset so stale "Next:" hint isn't shown until prefetch finishes

    // Helper: auto-complete a firm that has only Dynamo contacts (no manual review needed)
    function maybeAutoComplete(f, c) {
      if (f.workflow_status !== 'unreviewed') return f
      const isDynamoOnly = c.length > 0 && c.every(contact => contact.source === 'dynamo')
      if (!isDynamoOnly) return f
      // Fire-and-forget; update local state optimistically
      updateFirmStatus(f.id, 'complete').catch(console.error)
      return { ...f, workflow_status: 'complete', workflow_completed_at: new Date().toISOString() }
    }

    // Serve from prefetch cache if available — makes navigation feel instant
    const cached = firmDataCache.get(String(id))
    if (cached) {
      const autoF = maybeAutoComplete(cached.firm, cached.contacts)
      setFirm(autoF)
      setContacts(cached.contacts)
      setMaxContacts(cached.maxContacts || 5)
      setLoading(false)
      firmDataCache.delete(String(id)) // consume the entry to free memory
      return
    }

    setLoading(true)
    setFirm(null)
    Promise.all([
      getFirm(id),
      getFirmContacts(id),
      getSettings(),
    ]).then(([f, c, s]) => {
      const autoF = maybeAutoComplete(f, c)
      setFirm(autoF)
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

  // Apply title filter + email/LinkedIn filters + sort — Dynamo contacts float to top, then selected, then rest
  const { filteredDynamo, filteredSelected, filteredUnselected } = useMemo(() => {
    let list = availableContacts
    if (titleFilter.trim()) {
      const q = titleFilter.toLowerCase()
      list = list.filter(c => (c.job_title || '').toLowerCase().includes(q) ||
                               (c.first_name + ' ' + c.last_name).toLowerCase().includes(q))
    }
    if (emailFilter)    list = list.filter(c => c.email)
    if (linkedinFilter) list = list.filter(c => c.linkedin_url)
    const dynamo = sortContacts(list.filter(c => c.source === 'dynamo'), sortField, sortDir)
    const sel    = sortContacts(list.filter(c => c.source !== 'dynamo' && c.is_selected === 1), sortField, sortDir)
    const unsel  = sortContacts(list.filter(c => c.source !== 'dynamo' && c.is_selected !== 1), sortField, sortDir)
    return { filteredDynamo: dynamo, filteredSelected: sel, filteredUnselected: unsel }
  }, [availableContacts, titleFilter, emailFilter, linkedinFilter, sortField, sortDir])

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

  // Multi-select derived values
  const allAvailableIds = useMemo(() => filteredAvailable.map(c => c.id), [filteredAvailable])
  const allPendingIds   = useMemo(() => pendingContacts.map(c => c.id),   [pendingContacts])

  const allAvailableSelected = allAvailableIds.length > 0 && allAvailableIds.every(id => selectedForAction.has(id))
  const allPendingSelected   = allPendingIds.length > 0   && allPendingIds.every(id => selectedForAction.has(id))
  const someAvailableSelected = allAvailableIds.some(id => selectedForAction.has(id))
  const somePendingSelected   = allPendingIds.some(id => selectedForAction.has(id))

  // Counts for the bulk action bar
  const selectedAvailableCount = allAvailableIds.filter(id => selectedForAction.has(id)).length
  const selectedPendingCount   = allPendingIds.filter(id => selectedForAction.has(id)).length

  // Whether the selection contains at least one non-Dynamo contact (shortlist eligible)
  const selectedContainNonDynamo = useMemo(() =>
    filteredAvailable.some(c => selectedForAction.has(c.id) && c.source !== 'dynamo'),
    [filteredAvailable, selectedForAction]
  )

  // Optimistic update: flip the UI immediately, then sync with the server in the background.
  // If the server call fails, we roll back to the previous value.
  function handleToggle(contactId, value) {
    setContacts(cs => cs.map(c => c.id === contactId ? { ...c, is_selected: value } : c))
    if (value === 1 && firm?.workflow_status === 'unreviewed') {
      setFirm(f => ({ ...f, workflow_status: 'in_progress' }))
    }
    updateContact(contactId, { is_selected: value }).catch(() => {
      // Rollback on failure
      setContacts(cs => cs.map(c => c.id === contactId ? { ...c, is_selected: 1 - value } : c))
    })
  }

  async function handleStatusChange(contactId, status) {
    await updateContact(contactId, { filter_status: status })
    setContacts(cs => cs.map(c => c.id === contactId ? { ...c, filter_status: status, is_selected: 0 } : c))
  }

  async function handleExclude(contactId) {
    await updateContact(contactId, { filter_status: 'blacklisted' })
    setContacts(cs => cs.map(c => c.id === contactId ? { ...c, filter_status: 'blacklisted', is_selected: 0 } : c))
  }

  // ── Multi-select helpers ────────────────────────────────────────────────────
  function toggleActionSelect(contactId) {
    setSelectedForAction(prev => {
      const next = new Set(prev)
      if (next.has(contactId)) next.delete(contactId)
      else next.add(contactId)
      return next
    })
  }

  function clearActionSelect() { setSelectedForAction(new Set()) }

  function selectSection(contactIds) {
    setSelectedForAction(prev => {
      const ids = contactIds.map(c => c.id)
      const allChecked = ids.every(id => prev.has(id))
      const next = new Set(prev)
      if (allChecked) ids.forEach(id => next.delete(id))
      else ids.forEach(id => next.add(id))
      return next
    })
  }

  function handleSelectAllByTitle(title) {
    // Select ALL contacts in the available list that have this exact job title
    const ids = filteredAvailable
      .filter(c => c.job_title === title)
      .map(c => c.id)
    setSelectedForAction(prev => {
      const next = new Set(prev)
      ids.forEach(id => next.add(id))
      return next
    })
  }

  async function handleBulkShortlist() {
    if (selectedForAction.size === 0 || isBulkWorking) return
    setIsBulkWorking(true)
    try {
      const ids = filteredAvailable
        .filter(c => selectedForAction.has(c.id) && c.source !== 'dynamo' && c.is_selected !== 1)
        .map(c => c.id)
      if (ids.length > 0) {
        await bulkUpdateContacts({ contact_ids: ids, is_selected: 1 })
        setContacts(cs => cs.map(c => ids.includes(c.id) ? { ...c, is_selected: 1 } : c))
        if (firm?.workflow_status === 'unreviewed') {
          setFirm(f => ({ ...f, workflow_status: 'in_progress' }))
        }
      }
      clearActionSelect()
    } catch (e) {
      alert('Error: ' + e.message)
    } finally {
      setIsBulkWorking(false)
    }
  }

  async function handleBulkExclude() {
    if (selectedForAction.size === 0 || isBulkWorking) return
    setIsBulkWorking(true)
    try {
      const ids = [...selectedForAction]
      await bulkUpdateContacts({ contact_ids: ids, filter_status: 'blacklisted' })
      setContacts(cs => cs.map(c =>
        selectedForAction.has(c.id) ? { ...c, filter_status: 'blacklisted', is_selected: 0 } : c
      ))
      clearActionSelect()
    } catch (e) {
      alert('Error: ' + e.message)
    } finally {
      setIsBulkWorking(false)
    }
  }

  async function handleBulkPendingStatus(status) {
    if (selectedForAction.size === 0 || isBulkWorking) return
    setIsBulkWorking(true)
    try {
      const ids = [...selectedForAction]
      await bulkUpdateContacts({ contact_ids: ids, filter_status: status })
      setContacts(cs => cs.map(c =>
        selectedForAction.has(c.id) ? { ...c, filter_status: status, is_selected: 0 } : c
      ))
      clearActionSelect()
    } catch (e) {
      alert('Error: ' + e.message)
    } finally {
      setIsBulkWorking(false)
    }
  }

  async function handleMarkComplete() {
    const currentId    = id
    const currentName  = firm?.display_name || firm?.lp_name || 'Firm'
    const targetFirm   = nextFirm

    // Show the "✓ Done!" checkmark immediately — no waiting on the server
    setTransitioning(true)
    setStatusSaving(true)

    // Fire save in the background — do NOT block navigation on it
    updateFirmStatus(currentId, 'complete').catch(e => {
      console.error('[FirmDetail] background save failed:', e)
    })

    // Brief visual flash so the user sees the success state
    await new Promise(r => setTimeout(r, 350))

    // Navigate immediately; pass the firm name so the next page can show a "saved" toast
    if (targetFirm) {
      navigate(`/firms/${targetFirm.id}`, { state: { justSaved: currentName } })
    } else {
      navigate('/firms')
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

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <div className="w-10 h-10 border-4 border-qgreen-200 border-t-qgreen-700 rounded-full animate-spin mb-4"></div>
      <p className="text-qgray-600 font-medium text-base">Loading firm…</p>
      <p className="text-sm text-qgray-400 mt-1">Fetching contacts and details</p>
    </div>
  )
  if (!firm) return null

  // Compute progress from fetched stats
  const pctComplete   = stats && stats.total_firms > 0
    ? Math.round((stats.firms_complete / stats.total_firms) * 100)
    : null
  const firmsRemaining = stats
    ? (stats.firms_unreviewed || 0) + (stats.firms_in_progress || 0) + (stats.firms_needs_attention || 0)
    : null

  const isComplete       = firm.workflow_status === 'complete'
  const needsAttention   = firm.workflow_status === 'needs_attention'

  return (
    <div className="space-y-5 w-full">

      {/* Full-page overlay — only shown during the brief "Done!" flash before navigating away */}
      {statusSaving && (
        <div className="fixed inset-0 bg-white/90 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-qgreen-600 flex items-center justify-center mx-auto mb-4 animate-bounce">
              <span className="text-white text-2xl font-bold">✓</span>
            </div>
            <p className="text-qgreen-800 font-semibold text-lg">Firm complete!</p>
            {nextFirm && (
              <p className="text-qgray-500 text-sm mt-1">
                Moving to <span className="font-medium text-qgray-700">{nextFirm.display_name || nextFirm.lp_name}</span>…
              </p>
            )}
          </div>
        </div>
      )}

      {/* "Saved" toast — shown after arriving here from marking a firm complete */}
      {savedFlash && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl border
          bg-qgreen-50 border-qgreen-200 text-qgreen-800 shadow-lg text-sm font-medium animate-fade-in">
          <span className="text-qgreen-600 text-base">✓</span>
          <span>
            <span className="font-semibold">{savedFlash}</span>
            {' '}marked complete &amp; saved
          </span>
        </div>
      )}

      {/* Breadcrumb + progress strip */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Breadcrumb items={[
          { label: 'LP Firms', to: '/firms' },
          { label: firm.display_name || firm.lp_name },
        ]} />

        {/* Overall progress tracker */}
        {pctComplete !== null && (
          <div className="flex items-center gap-3 bg-white border border-qgray-200 rounded-xl px-4 py-2 shadow-sm flex-1 max-w-sm min-w-48">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-2xs font-semibold text-qgray-500 uppercase tracking-wider">Overall Progress</span>
                <span className="text-xs font-bold text-qgreen-700">{pctComplete}%</span>
              </div>
              <div className="w-full bg-qgray-200 rounded-full h-1.5">
                <div
                  className="bg-qgreen-600 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${pctComplete}%` }}
                />
              </div>
            </div>
            <div className="text-xs text-qgray-500 flex-shrink-0 whitespace-nowrap">
              <span className="font-semibold text-qgray-700">{firmsRemaining}</span> remaining
            </div>
          </div>
        )}
      </div>

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
              <h1 className="font-display font-bold text-3xl text-qgray-900 tracking-tight">
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
          <div className="flex items-center gap-5 flex-shrink-0 flex-col sm:flex-row items-end sm:items-center">
            {/* Counter — shows both dynamo and capped counts */}
            <div className="text-right">
              <Tooltip text={`${nonDynamoSelectedCount} manually shortlisted of ${maxContacts} cap · ${dynamoSelectedCount} Dynamo auto-accepted (not capped)`}>
                <div className="cursor-default">
                  <div className="flex items-baseline gap-1 justify-end">
                    <span className="font-display font-bold text-2xl text-qgreen-700">{nonDynamoSelectedCount}</span>
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
              <div className="flex flex-col items-end gap-1">
                <button
                  onClick={handleMarkComplete}
                  disabled={statusSaving}
                  className="btn-primary"
                >
                  ✓ Done
                </button>
                {nextFirm && !statusSaving && (
                  <span className="text-2xs text-qgray-400 whitespace-nowrap">
                    Next: <span className="text-qgray-600 font-medium">{nextFirm.display_name || nextFirm.lp_name}</span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Contacts card */}
      <div className="card overflow-hidden">

        {/* Tab bar */}
        <div className="border-b border-qgray-200 px-4 flex items-center gap-0 bg-qgray-50">
          <button
            onClick={() => { setTab('available'); clearActionSelect() }}
            className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap
              ${tab === 'available'
                ? 'border-qgreen-700 text-qgreen-800'
                : 'border-transparent text-qgray-500 hover:text-qgray-700'}`}
          >
            Available contacts
            {availableContacts.length > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded text-xs
                ${tab === 'available' ? 'bg-qgreen-100 text-qgreen-700' : 'bg-qgray-100 text-qgray-600'}`}>
                {availableContacts.length}
              </span>
            )}
          </button>

          <button
            onClick={() => { setTab('pending'); clearActionSelect() }}
            className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap
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
            <div className="px-4 py-2.5 border-b border-qgray-100 flex items-center gap-3 bg-white flex-wrap">
              <input
                type="search"
                placeholder="Filter by name or title…"
                value={titleFilter}
                onChange={e => setTitleFilter(e.target.value)}
                className="input text-sm py-1.5 flex-1 min-w-36 max-w-64"
              />

              {/* Email filter toggle */}
              <button
                onClick={() => setEmailFilter(f => !f)}
                title={emailFilter ? 'Showing contacts with email only — click to clear' : 'Filter to contacts with email'}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0
                  ${emailFilter
                    ? 'bg-qgreen-700 text-white border-qgreen-700'
                    : 'bg-white text-qgray-600 border-qgray-300 hover:border-qgreen-500 hover:text-qgreen-700'}`}
              >
                <EmailIcon className="w-3.5 h-3.5" />
                Has Email
              </button>

              {/* LinkedIn filter toggle */}
              <button
                onClick={() => setLinkedinFilter(f => !f)}
                title={linkedinFilter ? 'Showing contacts with LinkedIn only — click to clear' : 'Filter to contacts with LinkedIn'}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0
                  ${linkedinFilter
                    ? 'bg-[#0077B5] text-white border-[#0077B5]'
                    : 'bg-white text-qgray-600 border-qgray-300 hover:border-[#0077B5] hover:text-[#0077B5]'}`}
              >
                <LinkedInIcon className="w-3.5 h-3.5" />
                Has LinkedIn
              </button>

              {(emailFilter || linkedinFilter) && (
                <button
                  onClick={() => { setEmailFilter(false); setLinkedinFilter(false) }}
                  className="text-xs text-qgray-500 hover:text-qgray-700 underline flex-shrink-0"
                >
                  Clear
                </button>
              )}

              <div className="flex items-center gap-3 ml-auto text-xs text-qgray-400">
                {filteredDynamo.length > 0 && (
                  <span className="font-medium text-purple-600 bg-purple-50 border border-purple-100 px-2 py-1 rounded">
                    {filteredDynamo.length} Dynamo (auto)
                  </span>
                )}
                {filteredSelected.length > 0 && (
                  <span className="font-medium text-qgreen-700 bg-qgreen-50 border border-qgreen-100 px-2 py-1 rounded">
                    {filteredSelected.length} shortlisted
                  </span>
                )}
                <span>{filteredAvailable.length} of {availableContacts.length} shown</span>
              </div>
            </div>

            {/* Bulk action bar — Available tab */}
            {selectedAvailableCount > 0 && (
              <div className="px-4 py-2.5 bg-qnavy-800 text-white flex items-center gap-3 flex-wrap">
                <span className="text-sm font-semibold">{selectedAvailableCount} selected</span>
                <div className="flex items-center gap-2">
                  {selectedContainNonDynamo && (
                    <button
                      onClick={handleBulkShortlist}
                      disabled={isBulkWorking}
                      className="text-xs px-3 py-1.5 rounded bg-qgreen-600 hover:bg-qgreen-500 text-white font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
                    >
                      ✓ Shortlist Selected
                    </button>
                  )}
                  <button
                    onClick={handleBulkExclude}
                    disabled={isBulkWorking}
                    className="text-xs px-3 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    ✕ Exclude Selected
                  </button>
                </div>
                <button
                  onClick={clearActionSelect}
                  className="ml-auto text-xs text-qnavy-300 hover:text-white transition-colors"
                >
                  Clear selection
                </button>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-qgray-50 border-b border-qgray-200">
                    {/* Select-all checkbox */}
                    <th className="px-3 py-2.5 w-8">
                      <input
                        type="checkbox"
                        checked={allAvailableSelected}
                        ref={el => { if (el) el.indeterminate = someAvailableSelected && !allAvailableSelected }}
                        onChange={() => {
                          if (allAvailableSelected) {
                            setSelectedForAction(prev => {
                              const next = new Set(prev)
                              allAvailableIds.forEach(id => next.delete(id))
                              return next
                            })
                          } else {
                            setSelectedForAction(prev => {
                              const next = new Set(prev)
                              allAvailableIds.forEach(id => next.add(id))
                              return next
                            })
                          }
                        }}
                        title="Select / deselect all visible contacts"
                        className="w-3.5 h-3.5 rounded border-qgray-300 cursor-pointer accent-qgreen-700"
                      />
                    </th>
                    <th className="px-4 py-2.5 text-left">
                      <button onClick={() => toggleSort('name')}
                        className={`flex items-center gap-1 font-semibold text-2xs uppercase tracking-wider
                          ${sortField === 'name' ? 'text-qgreen-800' : 'text-qgray-500 hover:text-qgray-700'}`}>
                        Name / Title
                        <span className="text-qgray-400">{sortField === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
                      </button>
                    </th>
                    <th className="px-4 py-2.5 text-left">
                      <button onClick={() => toggleSort('source')}
                        className={`flex items-center gap-1 font-semibold text-2xs uppercase tracking-wider
                          ${sortField === 'source' ? 'text-qgreen-800' : 'text-qgray-500 hover:text-qgray-700'}`}>
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
                            ${sortField === 'score' ? 'text-qgreen-800' : 'text-qgray-500 hover:text-qgray-700'}`}>
                          Score
                          <span className="text-qgray-400">{sortField === 'score' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
                        </button>
                      </Tooltip>
                    </th>
                    <th className="px-4 py-2.5 w-52"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAvailable.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-10 text-qgray-400 text-sm">
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
                            <td className="px-3 py-1.5 bg-purple-50 border-b border-purple-100 w-8">
                              <input
                                type="checkbox"
                                checked={filteredDynamo.every(c => selectedForAction.has(c.id))}
                                ref={el => { if (el) el.indeterminate = filteredDynamo.some(c => selectedForAction.has(c.id)) && !filteredDynamo.every(c => selectedForAction.has(c.id)) }}
                                onChange={() => selectSection(filteredDynamo)}
                                className="w-3.5 h-3.5 rounded border-purple-300 cursor-pointer accent-purple-600"
                                title="Select/deselect all Dynamo contacts"
                              />
                            </td>
                            <td colSpan={6} className="px-4 py-1.5 bg-purple-50 border-b border-purple-100">
                              <span className="text-2xs font-semibold text-purple-700 uppercase tracking-wider">
                                Dynamo — Auto-accepted · {filteredDynamo.length}
                              </span>
                            </td>
                          </tr>
                          {filteredDynamo.map(c => (
                            <AvailableContactRow key={c.id} contact={c} onToggle={handleToggle}
                              nonDynamoSelectedCount={nonDynamoSelectedCount} maxContacts={maxContacts}
                              onExclude={handleExclude}
                              isChecked={selectedForAction.has(c.id)}
                              onCheck={toggleActionSelect}
                              onSelectAllByTitle={handleSelectAllByTitle} />
                          ))}
                        </>
                      )}

                      {/* Manually shortlisted non-Dynamo contacts */}
                      {filteredSelected.length > 0 && (
                        <>
                          <tr>
                            <td className="px-3 py-1.5 bg-qgreen-50 border-b border-qgreen-100 w-8">
                              <input
                                type="checkbox"
                                checked={filteredSelected.every(c => selectedForAction.has(c.id))}
                                ref={el => { if (el) el.indeterminate = filteredSelected.some(c => selectedForAction.has(c.id)) && !filteredSelected.every(c => selectedForAction.has(c.id)) }}
                                onChange={() => selectSection(filteredSelected)}
                                className="w-3.5 h-3.5 rounded border-qgreen-300 cursor-pointer accent-qgreen-700"
                                title="Select/deselect all shortlisted contacts"
                              />
                            </td>
                            <td colSpan={6} className="px-4 py-1.5 bg-qgreen-50 border-b border-qgreen-100">
                              <span className="text-2xs font-semibold text-qgreen-700 uppercase tracking-wider">
                                Shortlisted · {filteredSelected.length} / {maxContacts}
                              </span>
                            </td>
                          </tr>
                          {filteredSelected.map(c => (
                            <AvailableContactRow key={c.id} contact={c} onToggle={handleToggle}
                              nonDynamoSelectedCount={nonDynamoSelectedCount} maxContacts={maxContacts}
                              onExclude={handleExclude}
                              isChecked={selectedForAction.has(c.id)}
                              onCheck={toggleActionSelect}
                              onSelectAllByTitle={handleSelectAllByTitle} />
                          ))}
                        </>
                      )}

                      {/* Remaining available contacts */}
                      {filteredUnselected.length > 0 && (
                        <>
                          {(filteredDynamo.length > 0 || filteredSelected.length > 0) && (
                            <tr>
                              <td className="px-3 py-1.5 bg-qgray-50 border-b border-qgray-100 w-8">
                                <input
                                  type="checkbox"
                                  checked={filteredUnselected.every(c => selectedForAction.has(c.id))}
                                  ref={el => { if (el) el.indeterminate = filteredUnselected.some(c => selectedForAction.has(c.id)) && !filteredUnselected.every(c => selectedForAction.has(c.id)) }}
                                  onChange={() => selectSection(filteredUnselected)}
                                  className="w-3.5 h-3.5 rounded border-qgray-300 cursor-pointer accent-qgreen-700"
                                  title="Select/deselect all available contacts"
                                />
                              </td>
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
                              nonDynamoSelectedCount={nonDynamoSelectedCount} maxContacts={maxContacts}
                              onExclude={handleExclude}
                              isChecked={selectedForAction.has(c.id)}
                              onCheck={toggleActionSelect}
                              onSelectAllByTitle={handleSelectAllByTitle} />
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
          <>
            {/* Bulk action bar — Pending tab */}
            {selectedPendingCount > 0 && (
              <div className="px-4 py-2.5 bg-qnavy-800 text-white flex items-center gap-3 flex-wrap">
                <span className="text-sm font-semibold">{selectedPendingCount} selected</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleBulkPendingStatus('approved')}
                    disabled={isBulkWorking}
                    className="text-xs px-3 py-1.5 rounded bg-qteal-600 hover:bg-qteal-500 text-white font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    ✓ Approve Selected
                  </button>
                  <button
                    onClick={() => handleBulkPendingStatus('blacklisted')}
                    disabled={isBulkWorking}
                    className="text-xs px-3 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    ✕ Reject Selected
                  </button>
                </div>
                <button
                  onClick={clearActionSelect}
                  className="ml-auto text-xs text-qnavy-300 hover:text-white transition-colors"
                >
                  Clear selection
                </button>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-qgray-50 border-b border-qgray-200">
                    {/* Select-all checkbox */}
                    <th className="px-3 py-2.5 w-8">
                      <input
                        type="checkbox"
                        checked={allPendingSelected}
                        ref={el => { if (el) el.indeterminate = somePendingSelected && !allPendingSelected }}
                        onChange={() => {
                          if (allPendingSelected) {
                            setSelectedForAction(prev => {
                              const next = new Set(prev)
                              allPendingIds.forEach(id => next.delete(id))
                              return next
                            })
                          } else {
                            setSelectedForAction(prev => {
                              const next = new Set(prev)
                              allPendingIds.forEach(id => next.add(id))
                              return next
                            })
                          }
                        }}
                        title="Select / deselect all under-review contacts"
                        className="w-3.5 h-3.5 rounded border-qgray-300 cursor-pointer accent-qgreen-700"
                      />
                    </th>
                    <th className="px-4 py-2.5 text-left font-semibold text-2xs uppercase tracking-wider text-qgray-500">Name / Title</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-2xs uppercase tracking-wider text-qgray-500">Email</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-2xs uppercase tracking-wider text-qgray-500">Role tags</th>
                    <th className="px-4 py-2.5 font-semibold text-2xs uppercase tracking-wider text-qgray-500">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingContacts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-10 text-qgray-400 text-sm">
                        No contacts pending review for this firm.
                      </td>
                    </tr>
                  ) : pendingContacts.map(c => (
                    <PendingContactRow
                      key={c.id}
                      contact={c}
                      onStatusChange={handleStatusChange}
                      isChecked={selectedForAction.has(c.id)}
                      onCheck={toggleActionSelect}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

    </div>
  )
}
