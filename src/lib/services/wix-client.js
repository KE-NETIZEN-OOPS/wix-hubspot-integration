const WIX_BASE = 'https://www.wixapis.com'
function wixHeaders() {
  return { Authorization: process.env.WIX_API_KEY, 'wix-site-id': process.env.WIX_SITE_ID, 'Content-Type': 'application/json' }
}
export async function getWixContact(contactId) {
  const res = await fetch(`${WIX_BASE}/crm/v3/contacts/${contactId}`, { headers: wixHeaders() })
  if (!res.ok) throw new Error(`Wix getContact failed: ${res.status}`)
  return (await res.json()).contact
}
export async function createWixContact(fields) {
  const res = await fetch(`${WIX_BASE}/crm/v3/contacts`, { method: 'POST', headers: wixHeaders(), body: JSON.stringify({ info: _toWixInfo(fields) }) })
  if (!res.ok) throw new Error(`Wix createContact failed: ${res.status}`)
  return (await res.json()).contact
}
export async function updateWixContact(contactId, fields) {
  const res = await fetch(`${WIX_BASE}/crm/v3/contacts/${contactId}`, { method: 'PATCH', headers: wixHeaders(), body: JSON.stringify({ info: _toWixInfo(fields), revision: '0' }) })
  if (!res.ok) throw new Error(`Wix updateContact failed: ${res.status}`)
  return (await res.json()).contact
}
function _toWixInfo(fields) {
  const info = {}
  if (fields.firstName || fields.lastName) info.name = { first: fields.firstName, last: fields.lastName }
  if (fields.email) info.emails = [{ tag: 'MAIN', email: fields.email }]
  if (fields.phone) info.phones = [{ tag: 'MOBILE', phone: fields.phone }]
  if (fields._sync_id) info.extendedFields = { '_sync_id': fields._sync_id }
  return info
}
export function extractWixContactFields(contact) {
  return {
    firstName: contact.info && contact.info.name && contact.info.name.first,
    lastName: contact.info && contact.info.name && contact.info.name.last,
    email: contact.info && contact.info.emails && contact.info.emails[0] && contact.info.emails[0].email,
    phone: contact.info && contact.info.phones && contact.info.phones[0] && contact.info.phones[0].phone,
    _sync_id: contact.info && contact.info.extendedFields && contact.info.extendedFields['_sync_id'],
  }
}
