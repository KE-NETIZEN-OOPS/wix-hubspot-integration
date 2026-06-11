import { getPendingBatch, markProcessing, markDone, markFailed, enqueue } from '../data-access/sync-queue.js'
import { logSync, hasBeenProcessed, purgeExpired, getLatestSyncTimestamp } from '../data-access/sync-log.js'
import { getByWixId, getByHubspotId, upsertMapping } from '../data-access/contact-id-map.js'
import { getAllMappings } from '../data-access/field-mappings.js'
import { buildSyncPayload, hasChanged } from '../services/contact-mapper.js'
import { getContact, updateContact, createContact } from '../services/hubspot-client.js'
import { createWixContact, updateWixContact, listWixContactsUpdatedSince, extractWixContactFields } from '../services/wix-client.js'
import { v4 as uuidv4 } from 'uuid'

export async function processSyncQueue() {
  await purgeExpired()
  await pollWixContacts()
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

async function pollWixContacts() {
  const lastSync = await getLatestSyncTimestamp()
  const contacts = await listWixContactsUpdatedSince(lastSync)
  for (const contact of contacts) {
    const syncId = `wix_poll_${contact.id}_${contact.revision || 0}`
    if (await hasBeenProcessed(syncId)) continue
    const fields = extractWixContactFields(contact)
    await enqueue({ syncId, source: 'wix', eventType: 'contact.updated', contactId: contact.id, payload: fields })
  }
}

async function processItem(item, mappings) {
  if (await hasBeenProcessed(item.syncId)) return
  if (item.source === 'wix') {
    await syncWixContactToHubspot(item, mappings)
  } else {
    await syncHubspotContactToWix(item, mappings)
  }
}

async function syncWixContactToHubspot(item, mappings) {
  const hsPayload = buildSyncPayload(item.payload, mappings, 'wix')
  let mapping = await getByWixId(item.contactId)
  if (mapping) {
    const current = await getContact(mapping.hubspot_contact_id)
    const { hs_sync_id: _ignored, ...hsPayloadForDiff } = hsPayload
    if (!hasChanged(current.properties, hsPayloadForDiff)) return
    await updateContact(mapping.hubspot_contact_id, hsPayload)
  } else {
    const created = await createContact(hsPayload)
    mapping = { wixContactId: item.contactId, hubspotContactId: created.id }
    await upsertMapping({ ...mapping, lastSyncSource: 'wix' })
  }
  await logSync({ syncId: item.syncId, source: 'wix', wixContactId: item.contactId, hubspotContactId: mapping.hubspot_contact_id || mapping.hubspotContactId })
}

async function syncHubspotContactToWix(item, mappings) {
  const wixPayload = buildSyncPayload(item.payload, mappings, 'hubspot')
  wixPayload._sync_id = item.syncId
  let mapping = await getByHubspotId(item.contactId)
  if (mapping) {
    await updateWixContact(mapping.wix_contact_id, wixPayload)
  } else {
    const created = await createWixContact(wixPayload)
    mapping = { wixContactId: created.id, hubspotContactId: item.contactId }
    await upsertMapping({ ...mapping, lastSyncSource: 'hubspot' })
  }
  await logSync({ syncId: item.syncId, source: 'hubspot', wixContactId: mapping.wix_contact_id || mapping.wixContactId, hubspotContactId: item.contactId })
}
