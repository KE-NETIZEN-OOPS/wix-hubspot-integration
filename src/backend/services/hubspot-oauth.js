import { exchangeCodeForTokens, registerWebhook, deregisterWebhook } from './hubspot-client'
import { saveTokens, getTokens, clearTokens } from './token-store'
import { getSecret, createSecret, updateSecret, deleteSecret, listSecretInfo } from 'wix-secrets-backend'

const SCOPES = [
  'crm.objects.contacts.read',
  'crm.objects.contacts.write',
  'crm.schemas.contacts.read',
  'webhooks',
].join(' ')

// Set this to your HubSpot app ID once you create the app in HubSpot developer portal
const HUBSPOT_APP_ID = process.env.HUBSPOT_APP_ID || 'REPLACE_WITH_APP_ID'

export async function buildAuthUrl(redirectUri) {
  const clientId = await getSecret('hubspot_client_id')
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES,
  })
  return `https://app.hubspot.com/oauth/authorize?${params}`
}

export async function handleCallback(code, redirectUri) {
  const [clientId, clientSecret] = await Promise.all([
    getSecret('hubspot_client_id'),
    getSecret('hubspot_client_secret'),
  ])
  const tokens = await exchangeCodeForTokens(code, redirectUri, clientId, clientSecret)
  await saveTokens(tokens)

  const webhookTargetUrl = redirectUri.replace('oauth-callback', 'hubspot-webhook')
  const subs = await registerWebhook(HUBSPOT_APP_ID, webhookTargetUrl)

  // Store subscription IDs for disconnect
  await _upsertSecret('hubspot_webhook_sub_propertychange', String(subs.propertyChange.id))
  await _upsertSecret('hubspot_webhook_sub_creation', String(subs.creation.id))

  return tokens.portalId
}

export async function disconnect() {
  try {
    const [subPropChange, subCreation] = await Promise.all([
      getSecret('hubspot_webhook_sub_propertychange').catch(() => null),
      getSecret('hubspot_webhook_sub_creation').catch(() => null),
    ])
    if (subPropChange) await deregisterWebhook(HUBSPOT_APP_ID, subPropChange).catch(() => {})
    if (subCreation) await deregisterWebhook(HUBSPOT_APP_ID, subCreation).catch(() => {})
  } catch {
    // best-effort deregister
  }
  await clearTokens()
  // Clean up subscription ID secrets
  await _deleteSecretByName('hubspot_webhook_sub_propertychange')
  await _deleteSecretByName('hubspot_webhook_sub_creation')
}

export async function isConnected() {
  const tokens = await getTokens()
  return tokens !== null
}

async function _upsertSecret(name, value) {
  const all = await listSecretInfo()
  const found = all.find(s => s.name === name)
  if (found) {
    await updateSecret(found.id, { value })
  } else {
    await createSecret({ name, value })
  }
}

async function _deleteSecretByName(name) {
  try {
    const all = await listSecretInfo()
    const found = all.find(s => s.name === name)
    if (found) await deleteSecret(found.id)
  } catch {
    // best-effort
  }
}
