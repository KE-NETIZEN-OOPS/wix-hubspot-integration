import { enqueue } from '../data-access/sync-queue'
import { isOwnEcho, taggedWithSyncId } from '../services/loop-guard'
import { v4 as uuidv4 } from 'uuid'

export async function wixCrm_onContactCreated(event) {
  const { contactId, primaryEmail, firstName, lastName, phones } = event.entity

  const existingTag = taggedWithSyncId(event.entity)
  if (existingTag && await isOwnEcho(existingTag)) return

  const syncId = uuidv4()
  await enqueue({
    syncId,
    source: 'wix',
    eventType: 'contact.created',
    contactId,
    payload: {
      email: primaryEmail?.email,
      firstName,
      lastName,
      phone: phones?.[0]?.phone,
      updatedAt: Date.now(),
    },
  })
}

export async function wixCrm_onContactUpdated(event) {
  const { contactId, primaryEmail, firstName, lastName, phones } = event.entity

  const existingTag = taggedWithSyncId(event.entity)
  if (existingTag && await isOwnEcho(existingTag)) return

  const syncId = uuidv4()
  await enqueue({
    syncId,
    source: 'wix',
    eventType: 'contact.updated',
    contactId,
    payload: {
      email: primaryEmail?.email,
      firstName,
      lastName,
      phone: phones?.[0]?.phone,
      updatedAt: new Date(event.metadata?.updatedAt || Date.now()).getTime(),
    },
  })
}
