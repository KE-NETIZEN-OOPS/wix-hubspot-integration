import { handleCallback, verifyOAuthState } from '../../../lib/services/hubspot-oauth.js'
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    if (!code) return Response.json({ error: 'Missing code' }, { status: 400 })
    const cookieHeader = request.headers.get('cookie') || ''
    const expectedState = cookieHeader.split(';').map(c => c.trim()).find(c => c.startsWith('hs_oauth_state='))?.split('=')[1]
    if (!verifyOAuthState(state, expectedState)) return Response.json({ error: 'Invalid state' }, { status: 400 })
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    await handleCallback(code, `${appUrl}/api/oauth-callback`)
    const res = Response.redirect(`${appUrl}/dashboard/connect?connected=true`)
    res.headers.set('Set-Cookie', 'hs_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0')
    return res
  } catch (err) {
    console.error('OAuth callback error:', err.message)
    return Response.json({ error: 'OAuth failed' }, { status: 500 })
  }
}
