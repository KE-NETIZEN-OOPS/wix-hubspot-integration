import { enqueue } from '../../../lib/data-access/sync-queue.js'
import { hasBeenProcessed } from '../../../lib/data-access/sync-log.js'
import { extractUtmFields, buildAttributionProperties } from '../../../lib/services/utm-enricher.js'
import { v4 as uuidv4 } from 'uuid'
export async function POST(request) {
  try {
    const body = await request.json()
    const { contactId, eventType, email, firstName, lastName, phone, updatedAt, _sync_id } = body
    if (!contactId) return Response.json({ error: 'Missing contactId' }, { status: 400 })
    if (_sync_id && await hasBeenProcessed(_sync_id)) return Response.json({ skipped: true })
    const utmFields = extractUtmFields(body)
    const attribution = Object.keys(utmFields).length > 0
      ? buildAttributionProperties(utmFields, updatedAt || Date.now())
      : {}
    await enqueue({
      syncId: uuidv4(),
      source: 'wix',
      eventType: eventType === 'created' ? 'contact.created' : 'contact.updated',
      contactId,
      payload: { email, firstName, lastName, phone, updatedAt: updatedAt || Date.now(), ...attribution }
    })
    return Response.json({ queued: true })
  } catch (err) {
    console.error('Wix webhook error:', err.message)
    return Response.json({ error: 'Processing failed' }, { status: 500 })
  }
}
