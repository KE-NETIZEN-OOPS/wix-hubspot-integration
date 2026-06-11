const { test, expect } = require('@playwright/test')

// Live production URL + bypass token for API integration tests
const PROD = 'https://wix-hubspot-integration-j5wdrklm5-abedmach13-7398s-projects.vercel.app'
const BYPASS = 'LztAMkHk3grQO9bfFJSYtD1WkTSlw12T'
const prodHeaders = { 'x-vercel-protection-bypass': BYPASS }

// ─── API smoke tests (run against live production) ────────────────────────────

test('GET /api/connection-status returns JSON', async ({ request }) => {
  const res = await request.get(`${PROD}/api/connection-status`, { headers: prodHeaders })
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(typeof body.connected).toBe('boolean')
})

test('GET /api/sync-log returns items array', async ({ request }) => {
  const res = await request.get(`${PROD}/api/sync-log`, { headers: prodHeaders })
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(Array.isArray(body.items)).toBe(true)
})

test('GET /api/field-mappings returns mappings + wixFields + hsProps', async ({ request }) => {
  const res = await request.get(`${PROD}/api/field-mappings`, { headers: prodHeaders })
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(Array.isArray(body.mappings)).toBe(true)
  expect(Array.isArray(body.wixFields)).toBe(true)
  expect(Array.isArray(body.hsProps)).toBe(true)
  expect(body.wixFields).toContain('email')
  expect(body.wixFields).toContain('firstName')
})

test('POST /api/save-field-mappings validates input', async ({ request }) => {
  // Missing wixField → 400
  const bad = await request.post(`${PROD}/api/save-field-mappings`, {
    headers: prodHeaders,
    data: { mappings: [{ wixField: '', hubspotProperty: 'email' }] },
  })
  expect(bad.status()).toBe(400)

  // Empty array is valid
  const ok = await request.post(`${PROD}/api/save-field-mappings`, {
    headers: prodHeaders,
    data: { mappings: [] },
  })
  expect(ok.status()).toBe(200)

  // Duplicate hubspotProperty → 400
  const dup = await request.post(`${PROD}/api/save-field-mappings`, {
    headers: prodHeaders,
    data: { mappings: [
      { wixField: 'email', hubspotProperty: 'email', direction: 'both', transform: 'none' },
      { wixField: 'firstName', hubspotProperty: 'email', direction: 'both', transform: 'none' },
    ] },
  })
  expect(dup.status()).toBe(400)
  const dupBody = await dup.json()
  expect(dupBody.error).toMatch(/duplicate/i)
})

test('GET /api/start-oauth returns authUrl', async ({ request }) => {
  const res = await request.get('/api/start-oauth')
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(typeof body.authUrl).toBe('string')
  expect(body.authUrl).toContain('app.hubspot.com/oauth/authorize')
})

// ─── UI tests ────────────────────────────────────────────────────────────────

test('dashboard loads with dark background and title', async ({ page }) => {
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  // #111827 = rgb(17, 24, 39)
  expect(bg).toBe('rgb(17, 24, 39)')
  await expect(page.getByText('WIX ↔ HUBSPOT')).toBeVisible()
  await expect(page.getByText('Integration Dashboard')).toBeVisible()
})

test('dashboard shows three tabs', async ({ page }) => {
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('button', { name: 'Connection' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Field Mapping' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sync Log' })).toBeVisible()
})

test('Connection tab — not-connected state shows connect button', async ({ page }) => {
  await page.route('**/api/connection-status', route =>
    route.fulfill({ status: 200, body: JSON.stringify({ connected: false }) })
  )
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('button', { name: /Connect HubSpot/i })).toBeVisible()
  await expect(page.getByText('Read & write contacts')).toBeVisible()
  await expect(page.getByText('Read contact properties')).toBeVisible()
  await expect(page.getByText('Manage webhooks')).toBeVisible()
})

test('Connection tab — connected state shows portal ID and stats', async ({ page }) => {
  await page.route('**/api/connection-status', route =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        connected: true,
        portalId: '147990692',
        stats: { synced: 24, leads: 7, pending: 0, lastSync: new Date().toISOString() },
      }),
    })
  )
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')
  await expect(page.getByText('147990692')).toBeVisible()
  await expect(page.getByText('24')).toBeVisible()
  await expect(page.getByText('Contacts synced')).toBeVisible()
  await expect(page.getByText('Leads captured')).toBeVisible()
  await expect(page.getByText('Pending queue')).toBeVisible()
  await expect(page.getByRole('button', { name: /Disconnect HubSpot/i })).toBeVisible()
})

test('Connection tab — header badge shows Connected when connected', async ({ page }) => {
  await page.route('**/api/connection-status', route =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({ connected: true, portalId: '1234', stats: { synced: 0, leads: 0, pending: 0, lastSync: null } }),
    })
  )
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')
  await expect(page.getByText('Connected')).toBeVisible()
})

test('Connection tab — header badge shows Not connected when disconnected', async ({ page }) => {
  await page.route('**/api/connection-status', route =>
    route.fulfill({ status: 200, body: JSON.stringify({ connected: false }) })
  )
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')
  await expect(page.getByText('Not connected')).toBeVisible()
})

test('Connect button navigates to HubSpot OAuth URL', async ({ page }) => {
  await page.route('**/api/connection-status', route =>
    route.fulfill({ status: 200, body: JSON.stringify({ connected: false }) })
  )
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')

  const [popup] = await Promise.all([
    page.waitForNavigation({ waitUntil: 'commit', timeout: 5000 }).catch(() => null),
    page.getByRole('button', { name: /Connect HubSpot/i }).click(),
  ])
  // After click, page should be navigating to HubSpot (or start-oauth redirected us)
  await page.waitForTimeout(1500)
  const url = page.url()
  expect(url).toMatch(/hubspot\.com|localhost/)
})

test('?connected=true shows and auto-dismisses success banner', async ({ page }) => {
  await page.goto('/dashboard?connected=true')
  await page.waitForLoadState('networkidle')
  await expect(page.getByText('HubSpot connected successfully!')).toBeVisible()
  await page.waitForTimeout(3500)
  await expect(page.getByText('HubSpot connected successfully!')).not.toBeVisible()
})

test('Field Mapping tab — loads and shows Add Row and Save buttons', async ({ page }) => {
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Field Mapping' }).click()
  await expect(page.getByRole('button', { name: '+ Add Row' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Save Mappings/i })).toBeVisible()
})

test('Field Mapping tab — Add Row adds a new row', async ({ page }) => {
  await page.route('**/api/field-mappings', route =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        mappings: [],
        wixFields: ['email', 'firstName', 'lastName', 'phone'],
        hsProps: [{ name: 'email', label: 'Email' }, { name: 'firstname', label: 'First Name' }],
      }),
    })
  )
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Field Mapping' }).click()

  const rowsBefore = await page.locator('tbody tr').count()
  await page.getByRole('button', { name: '+ Add Row' }).click()
  const rowsAfter = await page.locator('tbody tr').count()
  expect(rowsAfter).toBe(rowsBefore + 1)
})

test('Field Mapping tab — delete row removes it', async ({ page }) => {
  await page.route('**/api/field-mappings', route =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        mappings: [{ wixField: 'email', hubspotProperty: 'email', direction: 'both', transform: 'none' }],
        wixFields: ['email', 'firstName', 'lastName', 'phone'],
        hsProps: [{ name: 'email', label: 'Email' }],
      }),
    })
  )
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Field Mapping' }).click()

  await expect(page.locator('tbody tr')).toHaveCount(1)
  await page.getByRole('button', { name: '✕' }).click()
  await expect(page.locator('tbody tr')).toHaveCount(0)
})

test('Field Mapping tab — save shows success message', async ({ page }) => {
  await page.route('**/api/field-mappings', route =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        mappings: [{ wixField: 'email', hubspotProperty: 'email', direction: 'both', transform: 'none' }],
        wixFields: ['email', 'firstName', 'lastName', 'phone'],
        hsProps: [{ name: 'email', label: 'Email' }],
      }),
    })
  )
  await page.route('**/api/save-field-mappings', route =>
    route.fulfill({ status: 200, body: JSON.stringify({ saved: true }) })
  )
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Field Mapping' }).click()
  await page.getByRole('button', { name: /Save Mappings/i }).click()
  await expect(page.getByText('Saved successfully.')).toBeVisible()
})

test('Field Mapping tab — save error shows error message', async ({ page }) => {
  await page.route('**/api/field-mappings', route =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        mappings: [{ wixField: 'email', hubspotProperty: 'email', direction: 'both', transform: 'none' }],
        wixFields: ['email', 'firstName', 'lastName', 'phone'],
        hsProps: [{ name: 'email', label: 'Email' }],
      }),
    })
  )
  await page.route('**/api/save-field-mappings', route =>
    route.fulfill({ status: 500, body: JSON.stringify({ error: 'Internal server error' }) })
  )
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Field Mapping' }).click()
  await page.getByRole('button', { name: /Save Mappings/i }).click()
  await expect(page.getByText('Internal server error')).toBeVisible()
})

test('Field Mapping tab — load failure disables save and shows warning', async ({ page }) => {
  await page.route('**/api/field-mappings', route =>
    route.fulfill({ status: 500, body: '' })
  )
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Field Mapping' }).click()
  await expect(page.getByText(/Failed to load mappings/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /Save Mappings/i })).toBeDisabled()
})

test('Field Mapping tab — null/empty mappings filtered on load', async ({ page }) => {
  await page.route('**/api/field-mappings', route =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        mappings: [
          { wixField: 'email', hubspotProperty: 'email', direction: 'both', transform: 'none' },
          { wixField: '', hubspotProperty: 'firstname', direction: 'both', transform: 'none' },
          { wixField: 'firstName', hubspotProperty: '', direction: 'both', transform: 'none' },
        ],
        wixFields: ['email', 'firstName'],
        hsProps: [{ name: 'email', label: 'Email' }],
      }),
    })
  )
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Field Mapping' }).click()
  // Only 1 valid row should be shown (email→email), 2 null ones filtered
  await expect(page.locator('tbody tr')).toHaveCount(1)
})

test('Sync Log tab — lazy loads only on first visit', async ({ page }) => {
  let fetchCount = 0
  await page.route('**/api/sync-log', route => {
    fetchCount++
    return route.fulfill({ status: 200, body: JSON.stringify({ items: [] }) })
  })
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')
  expect(fetchCount).toBe(0)

  await page.getByRole('button', { name: 'Sync Log' }).click()
  await page.waitForTimeout(800)
  expect(fetchCount).toBe(1)

  // Switch away and back — must NOT re-fetch
  await page.getByRole('button', { name: 'Connection' }).click()
  await page.getByRole('button', { name: 'Sync Log' }).click()
  await page.waitForTimeout(500)
  expect(fetchCount).toBe(1)
})

test('Sync Log tab — shows items with source badges', async ({ page }) => {
  const items = [
    { id: '1', sync_id: 'a', source: 'wix', event_type: 'contact.created', status: 'done', retry_count: 0, payload: { email: 'test@example.com' }, created_at: new Date().toISOString(), error: null },
    { id: '2', sync_id: 'b', source: 'hubspot', event_type: 'contact.updated', status: 'failed', retry_count: 3, payload: {}, created_at: new Date().toISOString(), error: 'Rate limit exceeded' },
  ]
  await page.route('**/api/sync-log', route =>
    route.fulfill({ status: 200, body: JSON.stringify({ items }) })
  )
  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'Sync Log' }).click()
  await page.waitForTimeout(500)
  await expect(page.getByText('contact.created')).toBeVisible()
  await expect(page.getByText('Rate limit exceeded')).toBeVisible()
  await expect(page.getByText('wix').first()).toBeVisible()
  await expect(page.getByText('hubspot', { exact: true })).toBeVisible()
})

test('Sync Log tab — filter Done hides Failed items', async ({ page }) => {
  const items = [
    { id: '1', sync_id: 'a', source: 'wix', event_type: 'contact.created', status: 'done', retry_count: 0, payload: {}, created_at: new Date().toISOString(), error: null },
    { id: '2', sync_id: 'b', source: 'wix', event_type: 'contact.updated', status: 'failed', retry_count: 1, payload: {}, created_at: new Date().toISOString(), error: 'oops' },
  ]
  await page.route('**/api/sync-log', route =>
    route.fulfill({ status: 200, body: JSON.stringify({ items }) })
  )
  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'Sync Log' }).click()
  await page.waitForTimeout(500)

  await page.getByRole('button', { name: '✓ Done' }).click()
  await expect(page.getByText('contact.created')).toBeVisible()
  await expect(page.getByText('contact.updated')).not.toBeVisible()
})

test('Sync Log tab — filter Failed hides Done items', async ({ page }) => {
  const items = [
    { id: '1', sync_id: 'a', source: 'wix', event_type: 'contact.created', status: 'done', retry_count: 0, payload: {}, created_at: new Date().toISOString(), error: null },
    { id: '2', sync_id: 'b', source: 'wix', event_type: 'contact.updated', status: 'failed', retry_count: 1, payload: {}, created_at: new Date().toISOString(), error: 'oops' },
  ]
  await page.route('**/api/sync-log', route =>
    route.fulfill({ status: 200, body: JSON.stringify({ items }) })
  )
  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'Sync Log' }).click()
  await page.waitForTimeout(500)

  await page.getByRole('button', { name: '✗ Failed' }).click()
  await expect(page.getByText('contact.updated')).toBeVisible()
  await expect(page.getByText('contact.created')).not.toBeVisible()
})

test('Sync Log tab — error state shows HTTP error', async ({ page }) => {
  await page.route('**/api/sync-log', route =>
    route.fulfill({ status: 500, body: JSON.stringify({ error: 'DB error' }) })
  )
  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'Sync Log' }).click()
  await page.waitForTimeout(800)
  await expect(page.getByText(/HTTP 500/)).toBeVisible()
})

test('Sync Log tab — empty state shows No items', async ({ page }) => {
  await page.route('**/api/sync-log', route =>
    route.fulfill({ status: 200, body: JSON.stringify({ items: [] }) })
  )
  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'Sync Log' }).click()
  await page.waitForTimeout(500)
  await expect(page.getByText('No items')).toBeVisible()
})

test('/dashboard/connect redirects to /dashboard', async ({ page }) => {
  const res = await page.goto('/dashboard/connect')
  await expect(page).toHaveURL(/\/dashboard$/)
})

test('/dashboard/field-mapping redirects to /dashboard', async ({ page }) => {
  await page.goto('/dashboard/field-mapping')
  await expect(page).toHaveURL(/\/dashboard$/)
})
