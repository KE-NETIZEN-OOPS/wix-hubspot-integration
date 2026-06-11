import { createHmac, timingSafeEqual } from 'crypto'
import { enqueue } from '../../../lib/data-access/sync-queue.js'
import { hasBeenProcessed } from '../../../lib/data-access/sync-log.js'
async function verifyHmac(request, rawBody) {
  try {
    const secret = process.env.HUBSPOT_CLIENT_SECRET
    if (!secret) return false
    const sigV3 = request.headers.get('x-hubspot-signature-v3')
    if (sigV3) {
      const timestamp = request.headers.get('x-hubspot-request-timestamp') || ''
      const data = 'POST' + request.url + rawBody + timestamp
      const expected = createHmac('sha256', secret).update(data).digest('base64')
      try { return timingSafeEqual(Buffer.from(expected), Buffer.from(sigV3)) } catch { return false }
    }
    const sigV1 = request.headers.get('x-hubspot-signature')
    if (sigV1) {
      const expected = createHmac('sha256', secret).update(secret + rawBody).digest('hex')
      try { return timingSafeEqual(Buffer.from(expected), Buffer.from(sigV1)) } catch { return false }
    }
    return false
  } catch { return false }
}
export async function POST(request) {
  try {
    const rawBody = await request.text()
    const sigValid = await verifyHmac(request, rawBody)
    console.log('Webhook hit — sig valid:', sigValid, '| body length:', rawBody.length)
    if (!sigValid) return Response.json({ error: 'Invalid signature' }, { status: 400 })
    const events = JSON.parse(rawBody)
    for (const event of events) {
      if (event.propertyName === 'hs_sync_id') continue
      const syncId = `hs_${event.objectId}_${event.occurredAt}_${event.propertyName || event.subscriptionType}`
      if (await hasBeenProcessed(syncId)) continue
      await enqueue({ syncId, source: 'hubspot', eventType: event.subscriptionType === 'contact.creation' ? 'contact.created' : 'contact.updated', contactId: String(event.objectId), payload: { [event.propertyName]: event.propertyValue, updatedAt: event.occurredAt } })
    }
    return Response.json({ received: true })
  } catch (err) {
    console.error('Webhook error:', err.message)
    return Response.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
