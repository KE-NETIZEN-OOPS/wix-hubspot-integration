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
    .descending('_createdDate')
    .limit(1)
    .find(OPTS)
  return items[0] || null
}

export async function purgeExpired() {
  const cutoff = new Date(Date.now() - TTL_MS)
  const { items } = await wixData.query(COLLECTION)
    .lt('_createdDate', cutoff)
    .find(OPTS)
  await Promise.all(items.map(i => wixData.remove(COLLECTION, i._id, OPTS)))
}
