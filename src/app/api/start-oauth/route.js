import { NextResponse } from 'next/server'
import { buildAuthUrl } from '../../../lib/services/hubspot-oauth.js'
export async function GET() {
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const { authUrl, state } = await buildAuthUrl(`${appUrl}/api/oauth-callback`)
    const res = NextResponse.json({ authUrl })
    res.cookies.set('hs_oauth_state', state, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600 })
    return res
  } catch (err) {
    console.error('start-oauth error:', err.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
