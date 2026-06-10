import { getAllMappings } from '../data-access/field-mappings'
import { getByWixId, upsertMapping } from '../data-access/contact-id-map'
import { logSync } from '../data-access/sync-log'
import { buildSyncPayload } from '../services/contact-mapper'
import { extractUtmFields, buildAttributionProperties } from '../services/utm-enricher'
import { searchContactByEmail, createContact, updateContact } from '../services/hubspot-client'
import { v4 as uuidv4 } from 'uuid'

export async function wixForms_onFormSubmit(event) {
  const { submission } = event
  const formData = submission.submissionData || {}
  const email = formData.email

  if (!email) return

  const mappings = await getAllMappings()
  const utm = extractUtmFields(formData)
  const syncId = uuidv4()

  const baseProps = buildSyncPayload(formData, mappings, 'wix')
  const attributionProps = buildAttributionProperties(utm, Date.now())

  const hsProperties = {
    ...baseProps,
    ...attributionProps,
    hs_sync_id: syncId,
  }

  const existingHsContact = await searchContactByEmail(email)

  let hubspotContactId
  if (existingHsContact) {
    hubspotContactId = existingHsContact.id
    await updateContact(hubspotContactId, hsProperties)
  } else {
    const created = await createContact(hsProperties)
    hubspotContactId = created.id
  }

  await upsertMapping({
    wixContactId: submission.contactId || `form_${syncId}`,
    hubspotContactId,
    lastSyncSource: 'wix',
  })

  await logSync({
    syncId,
    source: 'wix',
    wixContactId: submission.contactId || `form_${syncId}`,
    hubspotContactId,
  })
}
