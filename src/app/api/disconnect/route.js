import { disconnect } from '../../../lib/services/hubspot-oauth.js'
import { listWebhookSubscriptions, deregisterWebhook } from '../../../lib/services/hubspot-client.js'
export async function POST() {
  try {
    // Deregister webhooks best-effort before clearing tokens
    try {
      const appId = process.env.HUBSPOT_APP_ID
      const subs = await listWebhookSubscriptions(appId)
      await Promise.all(subs.map(s => deregisterWebhook(appId, s.id)))
    } catch (err) {
      console.warn('Webhook deregistration failed:', err.message)
    }
    await disconnect()
    return Response.json({ disconnected: true })
  } catch (err) {
    console.error('disconnect error:', err.message)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
