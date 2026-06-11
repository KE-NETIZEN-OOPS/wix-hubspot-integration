import { getDb } from '../db.js'
export async function enqueue({ syncId, source, eventType, contactId, payload }) {
  const db = getDb()
  const { error } = await db.from('sync_queue').insert({ sync_id: syncId, source, event_type: eventType, contact_id: contactId, payload, status: 'pending', retry_count: 0 })
  if (error) throw error
}
export async function getPendingBatch(limit = 10) {
  const db = getDb()
  const { data, error } = await db.from('sync_queue').select('*').eq('status', 'pending').limit(limit)
  if (error) throw error
  return (data || []).map(row => ({ _id: row.id, syncId: row.sync_id, source: row.source, eventType: row.event_type, contactId: row.contact_id, payload: row.payload }))
}
export async function markProcessing(id) {
  const db = getDb()
  const { error } = await db.from('sync_queue').update({ status: 'processing' }).eq('id', id)
  if (error) throw error
}
export async function markDone(id) {
  const db = getDb()
  const { error } = await db.from('sync_queue').update({ status: 'done' }).eq('id', id)
  if (error) throw error
}
export async function markFailed(id, errorMsg) {
  const db = getDb()
  const { data: row } = await db.from('sync_queue').select('retry_count').eq('id', id).single()
  const retryCount = ((row && row.retry_count) || 0) + 1
  const status = retryCount >= 3 ? 'failed' : 'pending'
  const { error } = await db.from('sync_queue').update({ status, retry_count: retryCount, error: String(errorMsg) }).eq('id', id)
  if (error) throw error
}
export async function countLeads() {
  const db = getDb()
  const { count, error } = await db.from('sync_queue').select('*', { count: 'exact' }).eq('source', 'wix').eq('status', 'done')
  if (error) throw error
  return count != null ? count : 0
}
