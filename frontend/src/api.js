/**
 * api.js — All HTTP calls to the FastAPI backend.
 * The JWT token is stored in localStorage under 'lp_token'.
 */

const BASE = '/api'

function getToken() {
  return localStorage.getItem('lp_token')
}

async function request(method, path, body, isFormData = false) {
  const token = getToken()
  const headers = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (!isFormData) headers['Content-Type'] = 'application/json'

  const opts = { method, headers }
  if (body) opts.body = isFormData ? body : JSON.stringify(body)

  const res = await fetch(`${BASE}${path}`, opts)

  if (res.status === 401) {
    localStorage.removeItem('lp_token')
    window.location.href = '/login'
    throw new Error('Unauthenticated')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }

  // CSV export returns non-JSON
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('text/csv')) return res.blob()

  return res.json()
}

const get  = (path)         => request('GET',    path)
const post = (path, body)   => request('POST',   path, body)
const patch = (path, body)  => request('PATCH',  path, body)
const del  = (path)         => request('DELETE', path)

// ── Auth ──────────────────────────────────────────────────────────────────────
export async function login(password) {
  const data = await post('/auth/login', { password })
  localStorage.setItem('lp_token', data.token)
  return data
}

export function logout() {
  localStorage.removeItem('lp_token')
  window.location.href = '/login'
}

export function isLoggedIn() {
  return !!getToken()
}

// ── Firms ─────────────────────────────────────────────────────────────────────
export function getFirms(params = {}) {
  // Filter out empty strings, null, and undefined — keep booleans (e.g. include_no_contacts)
  const q = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null && v !== undefined))
  ).toString()
  return get(`/firms${q ? '?' + q : ''}`)
}

export function getFirm(id)                  { return get(`/firms/${id}`) }
export function updateFirm(id, u)            { return patch(`/firms/${id}`, u) }
export function updateFirmStatus(id, status, reason) {
  return patch(`/firms/${id}/status`, { workflow_status: status, review_reason: reason ?? null })
}

// ── Settings ──────────────────────────────────────────────────────────────────
export function getSettings()    { return get('/settings') }
export function updateSettings(u){ return patch('/settings', u) }

// ── Contacts ──────────────────────────────────────────────────────────────────
export function getFirmContacts(firmId)     { return get(`/firms/${firmId}/contacts`) }
export function updateContact(id, update)   { return patch(`/contacts/${id}`, update) }
export function bulkUpdateContacts(update)  { return patch('/contacts/bulk-update', update) }

// ── Admin ─────────────────────────────────────────────────────────────────────
export function autoCompleteDynamoOnlyFirms() { return post('/admin/auto-complete-dynamo-only', {}) }

// ── Review Queue ──────────────────────────────────────────────────────────────
export function getPendingReview(params = {}) {
  const q = new URLSearchParams(params).toString()
  return get(`/review/pending${q ? '?' + q : ''}`)
}

// ── Outreach ──────────────────────────────────────────────────────────────────
export function getOutreach(params = {}) {
  const q = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
  ).toString()
  return get(`/outreach${q ? '?' + q : ''}`)
}
export function createOutreach(entry) { return post('/outreach', entry) }
export function deleteOutreach(id)    { return del(`/outreach/${id}`) }

// ── Selected Contacts ────────────────────────────────────────────────────────
export function getSelectedContacts() { return get('/contacts/selected') }

// ── Export ────────────────────────────────────────────────────────────────────

function _triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href    = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function exportContacts() {
  const date = new Date().toISOString().slice(0, 10)

  // Fetch both CSVs in parallel
  const [contactsBlob, firmsBlob] = await Promise.all([
    get('/export/contacts'),
    get('/export/firms'),
  ])

  // Trigger both downloads (small delay between them so browsers don't block)
  _triggerDownload(contactsBlob, `contacts_dynamo_${date}.csv`)
  await new Promise(r => setTimeout(r, 300))
  _triggerDownload(firmsBlob, `firms_preqin_${date}.csv`)
}

// ── Sync ──────────────────────────────────────────────────────────────────────
export async function uploadSyncFile(file) {
  const fd = new FormData()
  fd.append('file', file)
  return request('POST', '/sync/upload', fd, true)
}
export function commitSync(sessionId) { return post(`/sync/commit/${sessionId}`) }
export function getSyncHistory()      { return get('/sync/history') }

// ── Options & Stats ───────────────────────────────────────────────────────────
export function getOptions() { return get('/options') }
export function getStats()   { return get('/stats') }
