import { buildAuthUrl } from '../../../lib/services/hubspot-oauth.js'
export async function GET() {
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const authUrl = await buildAuthUrl(`${appUrl}/api/oauth-callback`)
    return Response.json({ authUrl })
  } catch (err) {
    console.error('start-oauth error:', err.message)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
