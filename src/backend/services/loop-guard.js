import { hasBeenProcessed } from '../data-access/sync-log'

export async function isOwnEcho(syncId) {
  return await hasBeenProcessed(syncId)
}

export function taggedWithSyncId(payload) {
  return payload?.hs_sync_id ?? null
}
