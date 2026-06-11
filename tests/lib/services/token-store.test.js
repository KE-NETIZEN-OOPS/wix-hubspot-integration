const { _mockClient } = require('@supabase/supabase-js')
beforeEach(() => { _mockClient._reset(); jest.resetModules() })
async function load() { return import('../../../src/lib/services/token-store.js') }
test('getTokens returns null when no row exists', async () => {
  const { getTokens } = await load()
  expect(await getTokens()).toBeNull()
})
test('saveTokens then getTokens returns correct tokens', async () => {
  const { saveTokens, getTokens } = await load()
  await saveTokens({ accessToken: 'at', refreshToken: 'rt', expiresAt: 9999999999000, portalId: '12345' })
  const t = await getTokens()
  expect(t.accessToken).toBe('at')
  expect(t.portalId).toBe('12345')
})
test('clearTokens makes getTokens return null', async () => {
  const { saveTokens, clearTokens, getTokens } = await load()
  await saveTokens({ accessToken: 'at', refreshToken: 'rt', expiresAt: 9999999999000, portalId: '12345' })
  await clearTokens()
  expect(await getTokens()).toBeNull()
})
test('needsRefresh true when expiry within 5 minutes', async () => {
  const { needsRefresh } = await load()
  expect(needsRefresh(Date.now() + 60000)).toBe(true)
})
test('needsRefresh false when token is fresh', async () => {
  const { needsRefresh } = await load()
  expect(needsRefresh(Date.now() + 3600000)).toBe(false)
})
