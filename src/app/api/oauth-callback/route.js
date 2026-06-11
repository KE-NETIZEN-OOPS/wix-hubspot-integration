import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { handleCallback, verifyOAuthState } from '../../../lib/services/hubspot-oauth.js'
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 })
    const cookieStore = await cookies()
    const expectedState = cookieStore.get('hs_oauth_state')?.value
    if (!verifyOAuthState(state, expectedState)) return NextResponse.json({ error: 'Invalid state' }, { status: 400 })
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    await handleCallback(code, `${appUrl}/api/oauth-callback`)
    const res = NextResponse.redirect(`${appUrl}/dashboard/connect?connected=true`)
    res.cookies.delete('hs_oauth_state')
    return res
  } catch (err) {
    console.error('OAuth callback error:', err.message)
    return NextResponse.json({ error: 'OAuth failed' }, { status: 500 })
  }
}
