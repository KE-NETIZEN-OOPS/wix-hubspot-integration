import { isConnected } from '../../../lib/services/hubspot-oauth.js'
import { getTokens } from '../../../lib/services/token-store.js'
import { countSynced } from '../../../lib/data-access/contact-id-map.js'
import { countLeads } from '../../../lib/data-access/sync-queue.js'
import { getLatestSyncTimestamp } from '../../../lib/data-access/sync-log.js'
export async function GET() {
  try {
    const connected = await isConnected()
    if (!connected) return Response.json({ connected: false })
    const tokens = await getTokens()
    const [synced, leads, lastSync] = await Promise.all([countSynced(), countLeads(), getLatestSyncTimestamp()])
    return Response.json({ connected: true, portalId: tokens.portalId, stats: { synced, leads, lastSync: lastSync ? new Date(lastSync).toISOString() : null } })
  } catch (err) {
    console.error('connection-status error:', err.message)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
