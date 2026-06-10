import { getSecret, createSecret, updateSecret, deleteSecret, listSecretInfo } from 'wix-secrets-backend'

const KEYS = ['hubspot_access_token', 'hubspot_refresh_token', 'hubspot_token_expiry', 'hubspot_portal_id']
const REFRESH_BUFFER_MS = 5 * 60 * 1000

async function upsertSecret(name, value) {
  const all = await listSecretInfo()
  const existing = all.find(s => s.name === name)
  if (existing) {
    await updateSecret(existing.id, { value: String(value) })
  } else {
    await createSecret({ name, value: String(value) })
  }
}

export async function getTokens() {
  try {
    const [accessToken, refreshToken, expiresAtStr, portalId] = await Promise.all(
      KEYS.map(k => getSecret(k))
    )
    return { accessToken, refreshToken, expiresAt: Number(expiresAtStr), portalId }
  } catch {
    return null
  }
}

export async function saveTokens({ accessToken, refreshToken, expiresAt, portalId }) {
  await Promise.all([
    upsertSecret('hubspot_access_token', accessToken),
    upsertSecret('hubspot_refresh_token', refreshToken),
    upsertSecret('hubspot_token_expiry', expiresAt),
    upsertSecret('hubspot_portal_id', portalId),
  ])
}

export async function clearTokens() {
  const all = await listSecretInfo()
  const ours = all.filter(s => KEYS.includes(s.name))
  await Promise.all(ours.map(s => deleteSecret(s.id)))
}

export function needsRefresh(expiresAt) {
  return expiresAt - Date.now() < REFRESH_BUFFER_MS
}
