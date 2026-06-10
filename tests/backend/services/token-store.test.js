const secretsMock = require('../../../tests/__mocks__/wix-secrets-backend')
// moduleNameMapper in jest.config.js already redirects wix-secrets-backend to the mock,
// so no jest.mock() factory is needed here.

const { getTokens, saveTokens, clearTokens, needsRefresh } = require('../../../src/backend/services/token-store')

beforeEach(() => {
  secretsMock._reset()
  jest.clearAllMocks()
})

test('getTokens returns parsed token object', async () => {
  secretsMock._set('hubspot_access_token', 'acc123')
  secretsMock._set('hubspot_refresh_token', 'ref456')
  secretsMock._set('hubspot_token_expiry', '9999999999000')
  secretsMock._set('hubspot_portal_id', 'portal789')

  const tokens = await getTokens()
  expect(tokens).toEqual({
    accessToken: 'acc123',
    refreshToken: 'ref456',
    expiresAt: 9999999999000,
    portalId: 'portal789',
  })
})

test('getTokens returns null when no token stored', async () => {
  const tokens = await getTokens()
  expect(tokens).toBeNull()
})

test('saveTokens writes all four secrets', async () => {
  await saveTokens({
    accessToken: 'a',
    refreshToken: 'r',
    expiresAt: 1000,
    portalId: 'p',
  })
  expect(secretsMock.createSecret).toHaveBeenCalledWith({ name: 'hubspot_access_token', value: 'a' })
  expect(secretsMock.createSecret).toHaveBeenCalledWith({ name: 'hubspot_refresh_token', value: 'r' })
  expect(secretsMock.createSecret).toHaveBeenCalledWith({ name: 'hubspot_token_expiry', value: '1000' })
  expect(secretsMock.createSecret).toHaveBeenCalledWith({ name: 'hubspot_portal_id', value: 'p' })
})

test('needsRefresh returns true when expiry is within 5 minutes', () => {
  const fiveMinFromNow = Date.now() + 4 * 60 * 1000
  expect(needsRefresh(fiveMinFromNow)).toBe(true)
})

test('needsRefresh returns false when expiry is far away', () => {
  const oneHourFromNow = Date.now() + 60 * 60 * 1000
  expect(needsRefresh(oneHourFromNow)).toBe(false)
})

test('clearTokens removes all four secrets', async () => {
  secretsMock._set('hubspot_access_token', 'a')
  secretsMock._set('hubspot_refresh_token', 'r')
  secretsMock._set('hubspot_token_expiry', '1000')
  secretsMock._set('hubspot_portal_id', 'p')

  await clearTokens()
  const remaining = await secretsMock.listSecretInfo()
  expect(remaining).toHaveLength(0)
})
