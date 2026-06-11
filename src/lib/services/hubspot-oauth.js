import { exchangeCodeForTokens, registerWebhook, deregisterWebhook } from './hubspot-client.js'
import { saveTokens, getTokens, clearTokens } from './token-store.js'
const SCOPES = ['crm.objects.contacts.read', 'crm.objects.contacts.write', 'crm.schemas.contacts.read'].join(' ')
let _oauthState = null
export async function buildAuthUrl(redirectUri) {
  const clientId = process.env.HUBSPOT_CLIENT_ID
  _oauthState = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, scope: SCOPES, state: _oauthState })
  return `https://app.hubspot.com/oauth/authorize?${params}`
}
export function verifyOAuthState(incomingState) {
  const valid = _oauthState !== null && _oauthState === incomingState
  _oauthState = null
  return valid
}
export async function handleCallback(code, redirectUri) {
  const clientId = process.env.HUBSPOT_CLIENT_ID
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET
  const tokens = await exchangeCodeForTokens(code, redirectUri, clientId, clientSecret)
  await saveTokens(tokens)
  const appId = process.env.HUBSPOT_APP_ID
  const webhookTargetUrl = redirectUri.replace('oauth-callback', 'hubspot-webhook')
  const subs = await registerWebhook(appId, webhookTargetUrl)
  process.env._HS_SUB_PROPCHANGE = String(subs.propertyChange.id)
  process.env._HS_SUB_CREATION = String(subs.creation.id)
  return tokens.portalId
}
export async function disconnect() {
  try {
    const appId = process.env.HUBSPOT_APP_ID
    const subPropChange = process.env._HS_SUB_PROPCHANGE
    const subCreation = process.env._HS_SUB_CREATION
    if (appId && subPropChange) await deregisterWebhook(appId, subPropChange).catch(() => {})
    if (appId && subCreation) await deregisterWebhook(appId, subCreation).catch(() => {})
  } catch {}
  await clearTokens()
}
export async function isConnected() { return (await getTokens()) !== null }
