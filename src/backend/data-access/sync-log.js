import wixData from 'wix-data'
const COLLECTION = 'SyncLog'
const OPTS = { suppressAuth: true }
const TTL_MS = 24 * 60 * 60 * 1000

export async function logSync({ syncId, source, wixContactId, hubspotContactId }) {
  return wixData.insert(COLLECTION, {
    syncId,
    source,
    wixContactId,
    hubspotContactId,
    _createdDate: new Date(),
  }, OPTS)
}

export async function hasBeenProcessed(syncId) {
  const { items } = await wixData.query(COLLECTION).eq('syncId', syncId).find(OPTS)
  return items.length > 0
}

export async function getLastSyncForContact(wixContactId) {
  const { items } = await wixData.query(COLLECTION)
    .eq('wixContactId', wixContactId)
    .find(OPTS)
  if (!items.length) return null
  return items.sort((a, b) => new Date(b._createdDate) - new Date(a._createdDate))[0]
}

export async function purgeExpired() {
  const cutoff = new Date(Date.now() - TTL_MS)
  const { items } = await wixData.query(COLLECTION).find(OPTS)
  const expired = items.filter(i => new Date(i._createdDate) < cutoff)
  await Promise.all(expired.map(i => wixData.remove(COLLECTION, i._id, OPTS)))
}
