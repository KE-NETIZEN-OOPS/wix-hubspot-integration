import { handleCallback, verifyOAuthState } from '../../../lib/services/hubspot-oauth.js'
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    if (!code) return Response.json({ error: 'Missing code' }, { status: 400 })
    if (!verifyOAuthState(state)) return Response.json({ error: 'Invalid state' }, { status: 400 })
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    await handleCallback(code, `${appUrl}/api/oauth-callback`)
    return Response.redirect(`${appUrl}/dashboard/connect?connected=true`)
  } catch (err) {
    console.error('OAuth callback error:', err.message)
    return Response.json({ error: 'OAuth failed' }, { status: 500 })
  }
}
