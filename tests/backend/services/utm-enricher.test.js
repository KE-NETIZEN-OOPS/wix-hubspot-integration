const { extractUtmFields, buildAttributionProperties } = require('../../../src/backend/services/utm-enricher')

test('extractUtmFields pulls utm params from form submission data', () => {
  const formData = {
    email: 'a@b.com',
    utm_source: 'google',
    utm_medium: 'cpc',
    utm_campaign: 'summer',
    utm_term: 'shoes',
    utm_content: 'banner',
    page_url: 'https://example.com/landing',
    referrer: 'https://google.com',
  }
  const utm = extractUtmFields(formData)
  expect(utm).toEqual({
    utm_source: 'google',
    utm_medium: 'cpc',
    utm_campaign: 'summer',
    utm_term: 'shoes',
    utm_content: 'banner',
    page_url: 'https://example.com/landing',
    referrer: 'https://google.com',
  })
})

test('extractUtmFields returns empty object when no utm fields present', () => {
  const utm = extractUtmFields({ email: 'a@b.com', name: 'Alice' })
  expect(utm).toEqual({})
})

test('buildAttributionProperties maps to HubSpot property names', () => {
  const utm = {
    utm_source: 'facebook',
    utm_medium: 'social',
    utm_campaign: 'launch',
    page_url: 'https://site.com/page',
    referrer: 'https://fb.com',
  }
  const props = buildAttributionProperties(utm, new Date('2026-06-10T10:00:00Z').getTime())
  expect(props).toEqual({
    utm_source: 'facebook',
    utm_medium: 'social',
    utm_campaign: 'launch',
    utm_content: undefined,
    utm_term: undefined,
    original_source_url: 'https://site.com/page',
    original_referrer: 'https://fb.com',
    first_form_submitted_at: '2026-06-10T10:00:00.000Z',
  })
})
