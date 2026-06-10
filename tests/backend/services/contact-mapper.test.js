const { buildSyncPayload, shouldSyncField } = require('../../../src/backend/services/contact-mapper')

const mappings = [
  { wixField: 'email', hubspotProperty: 'email', direction: 'both', transform: 'none' },
  { wixField: 'firstName', hubspotProperty: 'firstname', direction: 'both', transform: 'none' },
  { wixField: 'phone', hubspotProperty: 'phone', direction: 'wix_to_hs', transform: 'none' },
  { wixField: 'customTag', hubspotProperty: 'lifecyclestage', direction: 'hs_to_wix', transform: 'lowercase' },
]

test('shouldSyncField: wix_to_hs mapping is included for wix source', () => {
  expect(shouldSyncField(mappings[2], 'wix')).toBe(true)
})

test('shouldSyncField: wix_to_hs mapping is excluded for hubspot source', () => {
  expect(shouldSyncField(mappings[2], 'hubspot')).toBe(false)
})

test('shouldSyncField: hs_to_wix mapping is excluded for wix source', () => {
  expect(shouldSyncField(mappings[3], 'wix')).toBe(false)
})

test('shouldSyncField: both direction included for any source', () => {
  expect(shouldSyncField(mappings[0], 'wix')).toBe(true)
  expect(shouldSyncField(mappings[0], 'hubspot')).toBe(true)
})

test('buildSyncPayload from wix source maps wixField → hubspotProperty', () => {
  const sourceData = { email: 'test@example.com', firstName: 'Alice', phone: '+1234' }
  const payload = buildSyncPayload(sourceData, mappings, 'wix')
  expect(payload).toEqual({ email: 'test@example.com', firstname: 'Alice', phone: '+1234' })
})

test('buildSyncPayload from hubspot source maps hubspotProperty → wixField', () => {
  const sourceData = { email: 'test@example.com', firstname: 'Bob', lifecyclestage: 'LEAD' }
  const payload = buildSyncPayload(sourceData, mappings, 'hubspot')
  expect(payload).toEqual({ email: 'test@example.com', firstName: 'Bob', customTag: 'lead' })
})

test('buildSyncPayload applies lowercase transform', () => {
  const sourceData = { lifecyclestage: 'CUSTOMER' }
  const payload = buildSyncPayload(sourceData, mappings, 'hubspot')
  expect(payload.customTag).toBe('customer')
})

test('buildSyncPayload skips undefined fields', () => {
  const sourceData = { email: 'x@x.com' }
  const payload = buildSyncPayload(sourceData, mappings, 'wix')
  expect(payload).not.toHaveProperty('phone')
})
