import { disconnect } from '../../../lib/services/hubspot-oauth.js'
export async function POST() {
  try {
    await disconnect()
    return Response.json({ disconnected: true })
  } catch (err) {
    console.error('disconnect error:', err.message)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
