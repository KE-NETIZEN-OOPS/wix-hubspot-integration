import wixData from 'wix-data'
const COLLECTION = 'ContactIdMap'
const OPTS = { suppressAuth: true }

export async function getByWixId(wixContactId) {
  const { items } = await wixData.query(COLLECTION).eq('wixContactId', wixContactId).find(OPTS)
  return items[0] || null
}

export async function getByHubspotId(hubspotContactId) {
  const { items } = await wixData.query(COLLECTION).eq('hubspotContactId', hubspotContactId).find(OPTS)
  return items[0] || null
}

export async function upsertMapping({ wixContactId, hubspotContactId, lastSyncSource }) {
  const existing = await getByWixId(wixContactId)
  const now = new Date()
  if (existing) {
    return wixData.update(COLLECTION, { ...existing, hubspotContactId, lastSyncedAt: now, lastSyncSource }, OPTS)
  }
  return wixData.insert(COLLECTION, { wixContactId, hubspotContactId, lastSyncedAt: now, lastSyncSource }, OPTS)
}

export async function countSynced() {
  return wixData.query(COLLECTION).count(OPTS)
}
