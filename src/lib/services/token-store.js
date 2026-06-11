import { getDb } from '../db.js'
const REFRESH_BUFFER_MS = 5 * 60 * 1000
export async function getTokens() {
  const db = getDb()
  const { data, error } = await db.from('oauth_tokens').select('*').eq('id', 1).single()
  if (error && error.code !== 'PGRST116') throw error
  if (!data) return null
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: Number(data.expires_at), portalId: data.portal_id }
}
export async function saveTokens({ accessToken, refreshToken, expiresAt, portalId }) {
  const db = getDb()
  const { error } = await db.from('oauth_tokens').upsert(
    { id: 1, access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt, portal_id: portalId, updated_at: new Date().toISOString() },
    { onConflict: 'id' }
  )
  if (error) throw error
}
export async function clearTokens() {
  const db = getDb()
  const { error } = await db.from('oauth_tokens').delete().eq('id', 1)
  if (error) throw error
}
export function needsRefresh(expiresAt) {
  return expiresAt - Date.now() < REFRESH_BUFFER_MS
}
