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

test('taggedWithSyncId extracts _sync_id from wix contact entity', () => {
  const wixEntity = { email: 'a@b.com', _sync_id: 'my-sync-id' }
  expect(taggedWithSyncId(wixEntity)).toBe('my-sync-id')
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

test('taggedWithSyncId returns empty string when _sync_id is empty string', () => {
  expect(taggedWithSyncId({ _sync_id: '' })).toBe('')
})
