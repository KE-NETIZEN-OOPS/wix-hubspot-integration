import { hasBeenProcessed } from '../data-access/sync-log.js'

export async function isOwnEcho(syncId) {
  return await hasBeenProcessed(syncId)
}

export function taggedWithSyncId(payload) {
  return payload?._sync_id ?? null
}
