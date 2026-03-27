import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getFirm, getFirmContacts, updateContact, getOutreach, createOutreach, deleteOutreach } from '../api'

const TAB_LABELS = {
  approved:       'Approved',
  dynamo:         'Dynamo',
  pending_review: 'Pending review',
  blacklisted:    'Blacklisted',
}

function ContactRow({ contact, onToggle, onStatusChange }) {
  const [saving, setSaving] = useState(false)
  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ')

  async function handleSelect() {
    setSaving(true)
    try { await onToggle(contact.id, contact.is_selected === 1 ? 0 : 1) }
    finally { setSaving(false) }
  }

  async function handleStatus(newStatus) {
    setSaving(true)
    try { await onStatusChange(contact.id, newStatus) }
    finally { setSaving(false) }
  }

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="px-4 py-3">
        {(contact.filter_status === 'approved' || contact.filter_status === 'dynamo') && (
          <input
            type="checkbox"
            checked={contact.is_selected === 1}
            onChange={handleSelect}
            disabled={saving}
            className="w-4 h-4 text-blue-600 rounded border-gray-300 cursor-pointer"
          />
        )}
      </td>
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900 text-sm">{fullName || <span className="text-gray-400">—</span>}</div>
        {contact.job_title && <div className="text-xs text-gray-500 mt-0.5">{contact.job_title}</div>}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {contact.email ? (
          <a href={`mailto:${contact.email}`} className="hover:text-blue-600 truncate block max-w-xs"
             onClick={e => e.stopPropagation()}>
            {contact.email}
          </a>
        ) : <span className="text-gray-300">No email</span>}
      </td>
      <td className="px-4 py-3 text-sm">
        {contact.linkedin_url ? (
          <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer"
             className="text-blue-600 hover:underline" onClick={e => e.stopPropagation()}>
            LinkedIn
          </a>
        ) : <span className="text-gray-300">—</span>}
      </td>
      <td className="px-4 py-3 text-center text-sm">
        {contact.filter_score != null ? (
          <span className={`font-medium ${contact.filter_score >= 80 ? 'text-green-600' : contact.filter_score >= 60 ? 'text-yellow-600' : 'text-gray-500'}`}>
            {contact.filter_score}
          </span>
        ) : <span className="text-gray-300">—</span>}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500 max-w-xs">
        {contact.role_tags || <span className="text-gray-300">—</span>}
      </td>
      {/* Actions for pending_review contacts */}
      {contact.filter_status === 'pending_review' && (
        <td className="px-4 py-3">
          <div className="flex gap-2">
            <button
              onClick={() => handleStatus('approved')}
              disabled={saving}
              className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
            >
              Approve
            </button>
            <button
              onClick={() => handleStatus('blacklisted')}
              disabled={saving}
              className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
            >
              Blacklist
            </button>
          </div>
        </td>
      )}
    </tr>
  )
}

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
          placeholder="Brief notes on this outreach…"
          className="input text-sm" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Logged by</label>
        <input type="text" value={form.logged_by}
          onChange={e => setForm(f => ({ ...f, logged_by: e.target.value }))}
          placeholder="Your name"
          className="input text-sm" />
      </div>
      <div className="col-span-full flex justify-end">
        <button type="submit" disabled={saving} className="btn-primary text-sm">
          {saving ? 'Saving…' : 'Log outreach'}
        </button>
      </div>
    </form>
  )
}

export default function FirmDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [firm, setFirm]         = useState(null)
  const [contacts, setContacts] = useState([])
  const [outreach, setOutreach] = useState([])
  const [tab, setTab]           = useState('approved')
  const [loading, setLoading]   = useState(true)
  const [showOutreachForm, setShowOutreachForm] = useState(false)

  useEffect(() => {
    Promise.all([
      getFirm(id),
      getFirmContacts(id),
      getOutreach({ firm_id: id }),
    ]).then(([f, c, o]) => {
      setFirm(f)
      setContacts(c)
      setOutreach(o.entries || [])
    }).catch(err => {
      if (err.message.includes('404')) navigate('/firms')
    }).finally(() => setLoading(false))
  }, [id])

  async function handleToggle(contactId, value) {
    await updateContact(contactId, { is_selected: value })
    setContacts(cs => cs.map(c => c.id === contactId ? { ...c, is_selected: value } : c))
  }

  async function handleStatus(contactId, status) {
    await updateContact(contactId, { filter_status: status })
    setContacts(cs => cs.map(c => c.id === contactId ? { ...c, filter_status: status } : c))
  }

  async function handleDeleteOutreach(entryId) {
    if (!confirm('Delete this outreach entry?')) return
    await deleteOutreach(entryId)
    setOutreach(os => os.filter(o => o.id !== entryId))
  }

  async function refreshOutreach() {
    const data = await getOutreach({ firm_id: id })
    setOutreach(data.entries || [])
  }

  if (loading) return <div className="text-center py-20 text-gray-400">Loading…</div>
  if (!firm)   return null

  const tabCounts = {}
  for (const c of contacts) tabCounts[c.filter_status] = (tabCounts[c.filter_status] || 0) + 1

  const tabContacts = contacts.filter(c => c.filter_status === tab)
  const selectedCount = contacts.filter(c => c.is_selected === 1).length

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Back + header */}
      <div>
        <button onClick={() => navigate('/firms')} className="text-sm text-gray-500 hover:text-gray-700 mb-3 flex items-center gap-1">
          ← Back to firms
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              {firm.display_name || firm.lp_name}
            </h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
              {firm.institution_type && <span>{firm.institution_type}</span>}
              {firm.country && <><span>·</span><span>{firm.country}</span></>}
              {firm.aum_usd_mn && <><span>·</span><span>AUM: ${(firm.aum_usd_mn / 1000).toFixed(1)}B</span></>}
              {firm.investor_status && (
                <><span>·</span>
                <span className="text-green-600 font-medium">{firm.investor_status}</span></>
              )}
            </div>
            {(firm.funds_active) && (
              <p className="text-xs text-gray-400 mt-1">Funds: {firm.funds_active}</p>
            )}
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold text-blue-700">{selectedCount}</div>
            <div className="text-xs text-gray-500">selected contacts</div>
          </div>
        </div>
      </div>

      {/* Contacts card */}
      <div className="card overflow-hidden">
        <div className="border-b border-gray-200 px-4 flex items-center gap-0">
          {Object.entries(TAB_LABELS).map(([key, label]) => {
            const count = tabCounts[key] || 0
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                  ${tab === key
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                {label}
                {count > 0 && (
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs
                    ${tab === key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-2 w-8"></th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">Name / Title</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">Email</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">LinkedIn</th>
                <th className="px-4 py-2 text-center font-medium text-gray-600">Score</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">Role tags</th>
                {tab === 'pending_review' && <th className="px-4 py-2 font-medium text-gray-600">Action</th>}
              </tr>
            </thead>
            <tbody>
              {tabContacts.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400 text-sm">
                  No contacts in this category.
                </td></tr>
              ) : (
                tabContacts.map(c => (
                  <ContactRow
                    key={c.id}
                    contact={c}
                    onToggle={handleToggle}
                    onStatusChange={handleStatus}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Outreach log card */}
      <div className="card p-5">
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
              <div key={entry.id} className="flex items-start justify-between text-sm py-2 border-b border-gray-50 last:border-0">
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
                  onClick={() => handleDeleteOutreach(entry.id)}
                  className="text-gray-300 hover:text-red-500 transition-colors text-xs ml-4 flex-shrink-0"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
