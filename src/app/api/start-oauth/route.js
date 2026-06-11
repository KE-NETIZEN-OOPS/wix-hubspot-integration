import { buildAuthUrl } from '../../../lib/services/hubspot-oauth.js'
export async function GET() {
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const { authUrl, state } = await buildAuthUrl(`${appUrl}/api/oauth-callback`)
    const res = Response.json({ authUrl })
    res.headers.set('Set-Cookie', `hs_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`)
    return res
  } catch (err) {
    console.error('start-oauth error:', err.message)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
