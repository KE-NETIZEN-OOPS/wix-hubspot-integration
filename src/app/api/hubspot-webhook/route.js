import { createHmac, timingSafeEqual } from 'crypto'
import { enqueue } from '../../../lib/data-access/sync-queue.js'
import { hasBeenProcessed } from '../../../lib/data-access/sync-log.js'
async function verifyHmac(body, signature) {
  if (!signature) return false
  try {
    const secret = process.env.HUBSPOT_WEBHOOK_SECRET
    const expected = createHmac('sha256', secret).update(body).digest('hex')
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch { return false }
}
export async function POST(request) {
  try {
    const rawBody = await request.text()
    const signature = request.headers.get('x-hubspot-signature-v3')
    if (!await verifyHmac(rawBody, signature)) return Response.json({ error: 'Invalid signature' }, { status: 400 })
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
