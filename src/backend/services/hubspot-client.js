import { fetch } from 'wix-fetch'
import { getTokens, saveTokens, needsRefresh } from './token-store'

const HS_BASE = 'https://api.hubspot.com'
const HS_TOKEN_URL = 'https://api.hubspot.com/oauth/v1/token'

async function getAccessToken() {
  const tokens = await getTokens()
  if (!tokens) throw new Error('HubSpot not connected')

  if (needsRefresh(tokens.expiresAt)) {
    const { getSecret } = await import('wix-secrets-backend')
    const [clientId, clientSecret] = await Promise.all([
      getSecret('hubspot_client_id'),
      getSecret('hubspot_client_secret'),
    ])
    const refreshed = await _refreshAccessToken(tokens.refreshToken, clientId, clientSecret, tokens.portalId)
    await saveTokens(refreshed)
    return refreshed.accessToken
  }
  return tokens.accessToken
}

async function _refreshAccessToken(refreshToken, clientId, clientSecret, portalId) {
  const res = await fetch(HS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&refresh_token=${encodeURIComponent(refreshToken)}`,
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`)
  const data = await res.json()
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    portalId,
  }
}

async function hsGet(path) {
  const token = await getAccessToken()
  const res = await fetch(`${HS_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`HubSpot GET ${path} failed: ${res.status}`)
  return res.json()
}

async function hsPost(path, body) {
  const token = await getAccessToken()
  const res = await fetch(`${HS_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`HubSpot POST ${path} failed: ${res.status} ${err}`)
  }
  return res.json()
}

async function hsPatch(path, body) {
  const token = await getAccessToken()
  const res = await fetch(`${HS_BASE}${path}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HubSpot PATCH ${path} failed: ${res.status}`)
  return res.json()
}

async function hsDelete(path) {
  const token = await getAccessToken()
  const res = await fetch(`${HS_BASE}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`HubSpot DELETE ${path} failed: ${res.status}`)
}

export async function exchangeCodeForTokens(code, redirectUri, clientId, clientSecret) {
  const res = await fetch(HS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=authorization_code&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${encodeURIComponent(code)}`,
  })
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`)
  const data = await res.json()
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    portalId: String(data.hub_id),
  }
}

export async function getContact(hubspotContactId, properties = ['email', 'firstname', 'lastname', 'phone', 'hs_sync_id']) {
  return hsGet(`/crm/v3/objects/contacts/${hubspotContactId}?properties=${properties.join(',')}`)
}

export async function createContact(properties) {
  return hsPost('/crm/v3/objects/contacts', { properties })
}

export async function updateContact(hubspotContactId, properties) {
  return hsPatch(`/crm/v3/objects/contacts/${hubspotContactId}`, { properties })
}

export async function searchContactByEmail(email) {
  const result = await hsPost('/crm/v3/objects/contacts/search', {
    filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
    properties: ['email', 'firstname', 'lastname', 'phone', 'hs_sync_id'],
    limit: 1,
  })
  return result.results[0] || null
}

export async function getContactProperties() {
  const result = await hsGet('/crm/v3/properties/contacts?limit=100')
  return result.results.map(p => ({ name: p.name, label: p.label }))
}

export async function registerWebhook(appId, targetUrl) {
  const [propertyChange, creation] = await Promise.all([
    hsPost(`/webhooks/v3/${appId}/subscriptions`, {
      eventType: 'contact.propertyChange',
      propertyName: '*',
      active: true,
      targetUrl,
    }),
    hsPost(`/webhooks/v3/${appId}/subscriptions`, {
      eventType: 'contact.creation',
      active: true,
      targetUrl,
    }),
  ])
  return { propertyChange, creation }
}

export async function deregisterWebhook(appId, subscriptionId) {
  return hsDelete(`/webhooks/v3/${appId}/subscriptions/${subscriptionId}`)
}
