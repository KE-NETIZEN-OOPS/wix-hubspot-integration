import wixData from 'wix-data'
const COLLECTION = 'SyncQueue'
const OPTS = { suppressAuth: true }

export async function enqueue({ syncId, source, eventType, contactId, payload }) {
  return wixData.insert(COLLECTION, {
    syncId,
    source,
    eventType,
    contactId,
    payload: JSON.stringify(payload),
    status: 'pending',
    retryCount: 0,
    error: null,
    _createdDate: new Date(),
  }, OPTS)
}

export async function getPendingBatch(limit = 10) {
  const { items } = await wixData.query(COLLECTION)
    .eq('status', 'pending')
    .limit(limit)
    .find(OPTS)
  return items.map(item => ({
    ...item,
    payload: JSON.parse(item.payload || '{}'),
  }))
}

export async function markProcessing(id) {
  const { items } = await wixData.query(COLLECTION).eq('_id', id).find(OPTS)
  const item = items[0]
  if (!item) return
  return wixData.update(COLLECTION, { ...item, status: 'processing' }, OPTS)
}

export async function markDone(id) {
  const { items } = await wixData.query(COLLECTION).eq('_id', id).find(OPTS)
  const item = items[0]
  if (!item) return
  return wixData.update(COLLECTION, { ...item, status: 'done' }, OPTS)
}

export async function markFailed(id, error) {
  const { items } = await wixData.query(COLLECTION).eq('_id', id).find(OPTS)
  const item = items[0]
  if (!item) return
  const retryCount = (item.retryCount || 0) + 1
  const status = retryCount >= 3 ? 'failed' : 'pending'
  return wixData.update(COLLECTION, { _id: id, status, retryCount, error: String(error) }, OPTS)
}

export async function countLeads() {
  return wixData.query(COLLECTION)
    .eq('eventType', 'form.submitted')
    .eq('status', 'done')
    .count(OPTS)
}
