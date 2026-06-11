const { _mockClient } = require('@supabase/supabase-js')
beforeEach(() => { _mockClient._reset(); jest.resetModules() })
async function load() { return import('../../../src/lib/data-access/contact-id-map.js') }
test('getByWixId returns null when not found', async () => {
  const { getByWixId } = await load()
  expect(await getByWixId('wix_123')).toBeNull()
})
test('upsertMapping inserts new mapping', async () => {
  const { upsertMapping, getByWixId } = await load()
  await upsertMapping({ wixContactId: 'wix_1', hubspotContactId: 'hs_1', lastSyncSource: 'wix' })
  const result = await getByWixId('wix_1')
  expect(result.hubspot_contact_id).toBe('hs_1')
})
test('upsertMapping updates existing mapping', async () => {
  const { upsertMapping, getByWixId } = await load()
  await upsertMapping({ wixContactId: 'wix_1', hubspotContactId: 'hs_1', lastSyncSource: 'wix' })
  await upsertMapping({ wixContactId: 'wix_1', hubspotContactId: 'hs_2', lastSyncSource: 'hubspot' })
  const result = await getByWixId('wix_1')
  expect(result.hubspot_contact_id).toBe('hs_2')
})
test('countSynced returns number of mappings', async () => {
  const { upsertMapping, countSynced } = await load()
  await upsertMapping({ wixContactId: 'wix_1', hubspotContactId: 'hs_1', lastSyncSource: 'wix' })
  await upsertMapping({ wixContactId: 'wix_2', hubspotContactId: 'hs_2', lastSyncSource: 'wix' })
  expect(await countSynced()).toBe(2)
})
