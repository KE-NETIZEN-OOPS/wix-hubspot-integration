import { getDb } from '../db.js'
export async function getByWixId(wixContactId) {
  const db = getDb()
  const { data, error } = await db.from('contact_id_map').select('*').eq('wix_contact_id', wixContactId).single()
  if (error && error.code !== 'PGRST116') throw error
  return data
}
export async function getByHubspotId(hubspotContactId) {
  const db = getDb()
  const { data, error } = await db.from('contact_id_map').select('*').eq('hubspot_contact_id', hubspotContactId).single()
  if (error && error.code !== 'PGRST116') throw error
  return data
}
export async function upsertMapping({ wixContactId, hubspotContactId, lastSyncSource }) {
  const db = getDb()
  const { data, error } = await db.from('contact_id_map').upsert(
    { wix_contact_id: wixContactId, hubspot_contact_id: hubspotContactId, last_sync_source: lastSyncSource, last_synced_at: new Date().toISOString() },
    { onConflict: 'wix_contact_id' }
  )
  if (error) throw error
  return data
}
export async function countSynced() {
  const db = getDb()
  const { count, error } = await db.from('contact_id_map').select('*', { count: 'exact' })
  if (error) throw error
  return count != null ? count : 0
}
