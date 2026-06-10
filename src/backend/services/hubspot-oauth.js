import { exchangeCodeForTokens, registerWebhook, deregisterWebhook } from './hubspot-client'
import { saveTokens, getTokens, clearTokens } from './token-store'
import { getSecret, createSecret, updateSecret, deleteSecret, listSecretInfo } from 'wix-secrets-backend'

const SCOPES = [
  'crm.objects.contacts.read',
  'crm.objects.contacts.write',
  'crm.schemas.contacts.read',
  'webhooks',
].join(' ')

async function getAppId() {
  return getSecret('hubspot_app_id')
}

export async function buildAuthUrl(redirectUri) {
  const clientId = await getSecret('hubspot_client_id')
  const state = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  await _upsertSecret('hubspot_oauth_state', state)
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES,
    state,
  })
  return `https://app.hubspot.com/oauth/authorize?${params}`
}

export async function verifyOAuthState(incomingState) {
  try {
    const stored = await getSecret('hubspot_oauth_state')
    await _deleteSecretByName('hubspot_oauth_state')
    return stored === incomingState
  } catch {
    return false
  }
}

export async function handleCallback(code, redirectUri) {
  const [clientId, clientSecret] = await Promise.all([
    getSecret('hubspot_client_id'),
    getSecret('hubspot_client_secret'),
  ])
  const tokens = await exchangeCodeForTokens(code, redirectUri, clientId, clientSecret)
  await saveTokens(tokens)

  const appId = await getAppId()
  const webhookTargetUrl = redirectUri.replace('oauth-callback', 'hubspot-webhook')
  const subs = await registerWebhook(appId, webhookTargetUrl)

  // Store subscription IDs for disconnect
  await Promise.all([
    _upsertSecret('hubspot_webhook_sub_propertychange', String(subs.propertyChange.id)),
    _upsertSecret('hubspot_webhook_sub_creation', String(subs.creation.id)),
  ])

  return tokens.portalId
}

export async function disconnect() {
  try {
    const [appId, subPropChange, subCreation] = await Promise.all([
      getAppId().catch(() => null),
      getSecret('hubspot_webhook_sub_propertychange').catch(() => null),
      getSecret('hubspot_webhook_sub_creation').catch(() => null),
    ])
    if (appId && subPropChange) await deregisterWebhook(appId, subPropChange).catch(() => {})
    if (appId && subCreation) await deregisterWebhook(appId, subCreation).catch(() => {})
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
