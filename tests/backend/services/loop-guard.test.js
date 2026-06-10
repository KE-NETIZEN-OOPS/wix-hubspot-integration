// moduleNameMapper in jest.config.js redirects wix-data → our in-memory mock,
// so jest.mock() is not needed here (the factory pattern causes hoisting issues).
const mockWixData = require('../../../tests/__mocks__/wix-data')

const { isOwnEcho, taggedWithSyncId } = require('../../../src/backend/services/loop-guard')

beforeEach(() => mockWixData._reset())

test('isOwnEcho returns true when syncId exists in SyncLog', async () => {
  mockWixData._store['SyncLog'] = [{ _id: '1', syncId: 'abc-123', source: 'wix' }]
  const result = await isOwnEcho('abc-123')
  expect(result).toBe(true)
})

test('isOwnEcho returns false for unknown syncId', async () => {
  const result = await isOwnEcho('unknown-id')
  expect(result).toBe(false)
})

test('taggedWithSyncId extracts hs_sync_id from hubspot event payload', () => {
  const hsPayload = { email: 'a@b.com', hs_sync_id: 'my-sync-id' }
  expect(taggedWithSyncId(hsPayload)).toBe('my-sync-id')
})

test('taggedWithSyncId returns null when not tagged', () => {
  expect(taggedWithSyncId({ email: 'a@b.com' })).toBeNull()
})

test('taggedWithSyncId returns null for null payload', () => {
  expect(taggedWithSyncId(null)).toBeNull()
})

test('taggedWithSyncId returns null for undefined payload', () => {
  expect(taggedWithSyncId(undefined)).toBeNull()
})

test('taggedWithSyncId returns empty string when hs_sync_id is empty string', () => {
  expect(taggedWithSyncId({ hs_sync_id: '' })).toBe('')
})
