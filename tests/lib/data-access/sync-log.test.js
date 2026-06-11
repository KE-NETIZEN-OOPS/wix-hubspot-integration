const { _mockClient } = require('@supabase/supabase-js')
beforeEach(() => { _mockClient._reset(); jest.resetModules() })
async function load() { return import('../../../src/lib/data-access/sync-log.js') }
test('hasBeenProcessed returns false when not logged', async () => {
  const { hasBeenProcessed } = await load()
  expect(await hasBeenProcessed('sync_123')).toBe(false)
})
test('logSync then hasBeenProcessed returns true', async () => {
  const { logSync, hasBeenProcessed } = await load()
  await logSync({ syncId: 'sync_1', source: 'wix', wixContactId: 'w1', hubspotContactId: 'h1' })
  expect(await hasBeenProcessed('sync_1')).toBe(true)
})
test('getLatestSyncTimestamp returns null when empty', async () => {
  const { getLatestSyncTimestamp } = await load()
  expect(await getLatestSyncTimestamp()).toBeNull()
})
test('getLatestSyncTimestamp returns timestamp after logSync', async () => {
  const { logSync, getLatestSyncTimestamp } = await load()
  await logSync({ syncId: 'sync_1', source: 'wix', wixContactId: 'w1', hubspotContactId: 'h1' })
  expect(await getLatestSyncTimestamp()).toBeTruthy()
})
