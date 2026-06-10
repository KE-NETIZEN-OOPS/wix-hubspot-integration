import { ok, serverError, badRequest, response } from 'wix-http-functions'
import { createHmac, timingSafeEqual } from 'crypto'
import { getSecret } from 'wix-secrets-backend'
import { handleCallback, verifyOAuthState } from './services/hubspot-oauth'
import { enqueue } from './data-access/sync-queue'
import { hasBeenProcessed, getLatestSyncTimestamp } from './data-access/sync-log'
import { isConnected, buildAuthUrl, disconnect as doDisconnect } from './services/hubspot-oauth'
import { getTokens } from './services/token-store'
import { countSynced } from './data-access/contact-id-map'
import { countLeads } from './data-access/sync-queue'
import { getAllMappings, saveMappings } from './data-access/field-mappings'
import { getContactProperties } from './services/hubspot-client'

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

export async function get_connectionStatus(request) {
  try {
    const connected = await isConnected()
    if (!connected) return ok({ body: JSON.stringify({ connected: false }) })

    const tokens = await getTokens()
    const [synced, leads, lastSync] = await Promise.all([countSynced(), countLeads(), getLatestSyncTimestamp()])
    return ok({ body: JSON.stringify({
      connected: true,
      portalId: tokens.portalId,
      stats: { synced, leads, lastSync: lastSync ? new Date(lastSync).toISOString() : null },
    }) })
  } catch (err) {
    console.error('get_connectionStatus error:', err.message)
    return serverError({ body: JSON.stringify({ error: 'Internal server error' }) })
  }
}

export async function get_startOauth(request) {
  try {
    const redirectUri = `${request.baseUrl}/_functions/oauth-callback`
    const authUrl = await buildAuthUrl(redirectUri)
    return ok({ body: JSON.stringify({ authUrl }) })
  } catch (err) {
    console.error('get_startOauth error:', err.message)
    return serverError({ body: JSON.stringify({ error: 'Internal server error' }) })
  }
}

export async function post_disconnect(request) {
  try {
    await doDisconnect()
    return ok({ body: JSON.stringify({ disconnected: true }) })
  } catch (err) {
    console.error('post_disconnect error:', err.message)
    return serverError({ body: JSON.stringify({ error: 'Internal server error' }) })
  }
}

export async function get_fieldMappings(request) {
  try {
    const [mappings, hsProps] = await Promise.all([getAllMappings(), getContactProperties()])
    const wixFields = ['email', 'firstName', 'lastName', 'phone', 'company', 'address', 'birthdate']
    return ok({ body: JSON.stringify({ mappings, hsProps, wixFields }) })
  } catch (err) {
    console.error('get_fieldMappings error:', err.message)
    return serverError({ body: JSON.stringify({ error: 'Internal server error' }) })
  }
}

export async function post_saveFieldMappings(request) {
  try {
    const body = await request.body.json()
    const { mappings } = body

    if (!Array.isArray(mappings)) {
      return badRequest({ body: JSON.stringify({ error: 'Invalid mappings: must be an array' }) })
    }

    const VALID_DIRECTIONS = new Set(['wix_to_hs', 'hs_to_wix', 'both'])
    const VALID_TRANSFORMS = new Set(['none', 'trim', 'lowercase'])
    for (const m of mappings) {
      if (!m.wixField || !m.hubspotProperty) {
        return badRequest({ body: JSON.stringify({ error: 'Each mapping must have wixField and hubspotProperty' }) })
      }
      if (m.direction && !VALID_DIRECTIONS.has(m.direction)) {
        return badRequest({ body: JSON.stringify({ error: `Invalid direction: ${m.direction}` }) })
      }
      if (m.transform && !VALID_TRANSFORMS.has(m.transform)) {
        return badRequest({ body: JSON.stringify({ error: `Invalid transform: ${m.transform}` }) })
      }
    }

    const seen = new Set()
    for (const m of mappings) {
      if (seen.has(m.hubspotProperty)) {
        return badRequest({ body: JSON.stringify({ error: `Duplicate HubSpot property: ${m.hubspotProperty}` }) })
      }
      seen.add(m.hubspotProperty)
    }

    await saveMappings(mappings)
    return ok({ body: JSON.stringify({ saved: true }) })
  } catch (err) {
    console.error('post_saveFieldMappings error:', err.message)
    return serverError({ body: JSON.stringify({ error: 'Internal server error' }) })
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
