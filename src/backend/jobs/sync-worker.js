import { getPendingBatch, markProcessing, markDone, markFailed } from '../data-access/sync-queue'
import { logSync, hasBeenProcessed, purgeExpired } from '../data-access/sync-log'
import { getByWixId, getByHubspotId, upsertMapping } from '../data-access/contact-id-map'
import { getAllMappings } from '../data-access/field-mappings'
import { buildSyncPayload, hasChanged } from '../services/contact-mapper'
import { getContact, updateContact, createContact } from '../services/hubspot-client'
import { contacts as wixContacts } from 'wix-crm-backend'
import { v4 as uuidv4 } from 'uuid'

export async function processSyncQueue() {
  await purgeExpired()
  const batch = await getPendingBatch(10)
  if (!batch.length) return

  const mappings = await getAllMappings()

  for (const item of batch) {
    await markProcessing(item._id)
    try {
      await processItem(item, mappings)
      await markDone(item._id)
    } catch (err) {
      console.error(`Sync failed for queue item ${item._id}:`, err.message)
      await markFailed(item._id, err.message)
    }
  }
}

async function processItem(item, mappings) {
  const alreadyProcessed = await hasBeenProcessed(item.syncId)
  if (alreadyProcessed) return

  if (item.source === 'wix') {
    await syncWixContactToHubspot(item, mappings)
  } else {
    await syncHubspotContactToWix(item, mappings)
  }
}

async function syncWixContactToHubspot(item, mappings) {
  const hsPayload = buildSyncPayload(item.payload, mappings, 'wix')
  hsPayload.hs_sync_id = item.syncId

  let mapping = await getByWixId(item.contactId)

  if (mapping) {
    const current = await getContact(mapping.hubspotContactId)
    const { hs_sync_id: _ignored, ...hsPayloadForDiff } = hsPayload
    if (!hasChanged(current.properties, hsPayloadForDiff)) return
    await updateContact(mapping.hubspotContactId, hsPayload)
  } else {
    const created = await createContact(hsPayload)
    mapping = { wixContactId: item.contactId, hubspotContactId: created.id }
    await upsertMapping({ ...mapping, lastSyncSource: 'wix' })
  }

  await logSync({
    syncId: item.syncId,
    source: 'wix',
    wixContactId: item.contactId,
    hubspotContactId: mapping.hubspotContactId,
  })
}

async function syncHubspotContactToWix(item, mappings) {
  const wixPayload = buildSyncPayload(item.payload, mappings, 'hubspot')
  wixPayload._sync_id = item.syncId

  let mapping = await getByHubspotId(item.contactId)

  if (mapping) {
    await wixContacts.updateContact(mapping.wixContactId, wixPayload)
  } else {
    const created = await wixContacts.createContact(wixPayload)
    mapping = { wixContactId: created.contactId, hubspotContactId: item.contactId }
    await upsertMapping({ ...mapping, lastSyncSource: 'hubspot' })
  }

  await logSync({
    syncId: item.syncId,
    source: 'hubspot',
    wixContactId: mapping.wixContactId,
    hubspotContactId: item.contactId,
  })
}

export { processSyncQueue as default }
