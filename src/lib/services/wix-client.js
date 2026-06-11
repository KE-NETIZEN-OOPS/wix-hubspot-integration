const WIX_BASE = 'https://www.wixapis.com'
function wixHeaders() {
  return {
    Authorization: process.env.WIX_API_KEY,
    'wix-site-id': process.env.WIX_SITE_ID,
    'wix-account-id': process.env.WIX_ACCOUNT_ID,
    'Content-Type': 'application/json',
  }
}
async function wixReq(method, path, body) {
  const res = await fetch(`${WIX_BASE}${path}`, { method, headers: wixHeaders(), body: body ? JSON.stringify(body) : undefined })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Wix ${method} ${path} failed: ${res.status} — ${text.slice(0, 300)}`)
  }
  return res.json()
}
export async function getWixContact(contactId) {
  const data = await wixReq('GET', `/contacts/v4/contacts/${contactId}`)
  return data.contact
}
export async function createWixContact(fields) {
  const data = await wixReq('POST', '/contacts/v4/contacts', { info: _toWixInfo(fields) })
  return data.contact
}
export async function updateWixContact(contactId, fields) {
  const current = await wixReq('GET', `/contacts/v4/contacts/${contactId}`)
  const revision = String(current.contact?.revision || '1')
  const data = await wixReq('PATCH', `/contacts/v4/contacts/${contactId}`, { revision, info: _toWixInfo(fields) })
  return data.contact
}
function _toWixInfo(fields) {
  const info = {}
  if (fields.firstName || fields.lastName) info.name = { first: fields.firstName || '', last: fields.lastName || '' }
  if (fields.email) info.emails = { items: [{ tag: 'MAIN', email: fields.email }] }
  if (fields.phone) info.phones = { items: [{ tag: 'MOBILE', phone: fields.phone }] }
  if (fields._sync_id) info.extendedFields = { items: { '_sync_id': fields._sync_id } }
  return info
}
export async function listWixContactsUpdatedSince(isoTimestamp) {
  const body = {
    query: {
      filter: isoTimestamp ? { updatedDate: { $gte: isoTimestamp } } : {},
      sort: [{ fieldName: 'updatedDate', order: 'DESC' }],
      paging: { limit: 100 },
    },
  }
  const data = await wixReq('POST', '/contacts/v4/contacts/query', body)
  return data.contacts || []
}
export function extractWixContactFields(contact) {
  const info = contact.info || {}
  return {
    firstName: info.name?.first,
    lastName: info.name?.last,
    email: info.emails?.items?.[0]?.email,
    phone: info.phones?.items?.[0]?.phone,
    _sync_id: info.extendedFields?.items?.['_sync_id'],
  }
}
