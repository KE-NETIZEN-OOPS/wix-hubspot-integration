import { ok, serverError, badRequest, response } from 'wix-http-functions'
import { createHmac, timingSafeEqual } from 'crypto'
import { getSecret } from 'wix-secrets-backend'
import { handleCallback, verifyOAuthState } from './services/hubspot-oauth'
import { enqueue } from './data-access/sync-queue'
import { hasBeenProcessed } from './data-access/sync-log'

const WEBHOOK_SECRET_NAME = 'hubspot_webhook_secret'

export async function get_oauthCallback(request) {
  try {
    const { code, state } = request.query
    if (!code) return badRequest({ body: JSON.stringify({ error: 'Missing code' }) })

    const stateValid = await verifyOAuthState(state)
    if (!stateValid) return badRequest({ body: JSON.stringify({ error: 'Invalid state' }) })

    const redirectUri = `${request.baseUrl}/_functions/oauth-callback`
    await handleCallback(code, redirectUri)

    return response({
      status: 302,
      headers: { Location: `https://${request.baseUrl}/dashboard/connect?connected=true` },
      body: '',
    })
  } catch (err) {
    console.error('OAuth callback error:', err.message)
    return serverError({ body: JSON.stringify({ error: 'OAuth failed' }) })
  }
}

export async function post_hubspotWebhook(request) {
  try {
    const rawBody = await request.body.text()
    const signature = request.headers['X-HubSpot-Signature-V3'] || request.headers['x-hubspot-signature-v3']

    const isValid = await verifyHmac(rawBody, signature)
    if (!isValid) return badRequest({ body: JSON.stringify({ error: 'Invalid signature' }) })

    const events = JSON.parse(rawBody)
    for (const event of events) {
      const syncId = `hs_${event.objectId}_${event.occurredAt}_${event.propertyName || event.subscriptionType}`

      // Drop echo: if this event was triggered by our own write, skip it
      if (event.propertyName === 'hs_sync_id') continue
      const alreadyProcessed = await hasBeenProcessed(syncId)
      if (alreadyProcessed) continue

      await enqueue({
        syncId,
        source: 'hubspot',
        eventType: event.subscriptionType === 'contact.creation' ? 'contact.created' : 'contact.updated',
        contactId: String(event.objectId),
        payload: { [event.propertyName]: event.propertyValue, updatedAt: event.occurredAt },
      })
    }

    return ok({ body: JSON.stringify({ received: true }) })
  } catch (err) {
    console.error('Webhook error:', err.message)
    return serverError({ body: JSON.stringify({ error: 'Webhook processing failed' }) })
  }
}

async function verifyHmac(body, signature) {
  if (!signature) return false
  try {
    const secret = await getSecret(WEBHOOK_SECRET_NAME)
    const expected = createHmac('sha256', secret).update(body).digest('hex')
    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
    } catch {
      return false
    }
  } catch (err) {
    console.error('Webhook signature verification failed — check hubspot_webhook_secret in SecretManager')
    return false
  }
}
