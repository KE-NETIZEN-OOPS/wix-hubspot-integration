import { getDb } from '../db.js'
const TTL_MS = 24 * 60 * 60 * 1000
export async function logSync({ syncId, source, wixContactId, hubspotContactId }) {
  const db = getDb()
  const { error } = await db.from('sync_log').insert({ sync_id: syncId, source, wix_contact_id: wixContactId, hubspot_contact_id: hubspotContactId })
  if (error) throw error
}
export async function hasBeenProcessed(syncId) {
  const db = getDb()
  const { data, error } = await db.from('sync_log').select('id').eq('sync_id', syncId).single()
  if (error && error.code !== 'PGRST116') throw error
  return data !== null
}
export async function getLastSyncForContact(wixContactId) {
  const db = getDb()
  const { data, error } = await db.from('sync_log').select('*').eq('wix_contact_id', wixContactId).order('created_at', { ascending: false }).limit(1).single()
  if (error && error.code !== 'PGRST116') throw error
  return data
}
export async function purgeExpired() {
  const db = getDb()
  const cutoff = new Date(Date.now() - TTL_MS).toISOString()
  const { error } = await db.from('sync_log').delete().lt('created_at', cutoff)
  if (error) throw error
}
export async function getLatestSyncTimestamp() {
  const db = getDb()
  const { data, error } = await db.from('sync_log').select('created_at').order('created_at', { ascending: false }).limit(1).single()
  if (error && error.code !== 'PGRST116') throw error
  return (data && data.created_at) || null
}
