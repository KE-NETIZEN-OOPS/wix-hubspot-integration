# Wix ↔ HubSpot Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Wix CLI app that bi-directionally syncs contacts between Wix and HubSpot, captures Wix form submissions to HubSpot with UTM attribution, and provides a dashboard UI for OAuth connection and field mapping configuration.

**Architecture:** Wix CLI app — all backend runs on Wix Functions (serverless), storage via Wix Data collections + SecretManager for tokens. Contact sync is async via a SyncQueue collection polled every 1 min; form capture is synchronous. Loop prevention uses per-write syncId tagging + SyncLog dedup.

**Tech Stack:** Wix CLI, Wix Functions (Node.js), Wix Data, Wix SecretManager, `wix-fetch`, `wix-http-functions`, `wix-crm-backend`, `wix-forms-backend`, React (dashboard pages), Jest + Babel (unit tests)

---

## File Map

```
src/
├── backend/
│   ├── services/
│   │   ├── token-store.js        # SecretManager read/write/refresh
│   │   ├── hubspot-client.js     # HubSpot API wrapper (contacts, properties, webhooks, oauth)
│   │   ├── hubspot-oauth.js      # Build auth URL, exchange code, disconnect
│   │   ├── contact-mapper.js     # Apply field mappings + per-field direction logic
│   │   ├── loop-guard.js         # Detect and drop own-echo events
│   │   └── utm-enricher.js       # Extract + normalise UTM fields from form payload
│   ├── data-access/
│   │   ├── contact-id-map.js     # CRUD for ContactIdMap collection
│   │   ├── field-mappings.js     # CRUD for FieldMappings collection
│   │   ├── sync-queue.js         # CRUD for SyncQueue collection
│   │   └── sync-log.js           # CRUD for SyncLog collection
│   ├── events/
│   │   ├── contacts.js           # wixCrm_onContactCreated / onContactUpdated
│   │   └── forms.js              # wixForms_onFormSubmit
│   ├── jobs/
│   │   └── sync-worker.js        # Scheduled job: processes SyncQueue batch
│   └── http-functions.js         # GET oauth-callback, POST hubspot-webhook
└── dashboard/
    └── pages/
        ├── connect/
        │   └── page.jsx          # Connect/disconnect page + stats
        └── field-mapping/
            └── page.jsx          # Field mapping table + save

tests/
├── __mocks__/
│   ├── wix-data.js
│   ├── wix-secrets-backend.js
│   └── wix-fetch.js
└── backend/
    └── services/
        ├── token-store.test.js
        ├── contact-mapper.test.js
        ├── loop-guard.test.js
        └── utm-enricher.test.js

wix.config.json                   # App config + scheduled job cron
package.json
babel.config.js
jest.config.js
```

---

## Task 1: Scaffold Project + Test Setup

**Files:**
- Create: `package.json`
- Create: `babel.config.js`
- Create: `jest.config.js`
- Create: `tests/__mocks__/wix-data.js`
- Create: `tests/__mocks__/wix-secrets-backend.js`
- Create: `tests/__mocks__/wix-fetch.js`

- [ ] **Step 1: Create the Wix CLI app**

```bash
npx @wix/cli@latest create-app
# Choose: Dashboard app
# App name: wix-hubspot-integration
cd wix-hubspot-integration
```

- [ ] **Step 2: Install test dependencies**

```bash
npm install --save-dev jest babel-jest @babel/core @babel/preset-env
```

- [ ] **Step 3: Create `babel.config.js`**

```js
module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
}
```

- [ ] **Step 4: Create `jest.config.js`**

```js
module.exports = {
  testEnvironment: 'node',
  moduleNameMapper: {
    'wix-data': '<rootDir>/tests/__mocks__/wix-data.js',
    'wix-secrets-backend': '<rootDir>/tests/__mocks__/wix-secrets-backend.js',
    'wix-fetch': '<rootDir>/tests/__mocks__/wix-fetch.js',
  },
  testMatch: ['**/tests/**/*.test.js'],
}
```

- [ ] **Step 5: Create `tests/__mocks__/wix-data.js`**

```js
const store = {}

const wixData = {
  _store: store,
  _reset() { Object.keys(store).forEach(k => delete store[k]) },

  query(collection) {
    const chain = {
      _filters: [],
      eq(field, value) { this._filters.push({ field, value }); return this },
      find() {
        const items = (store[collection] || []).filter(item =>
          chain._filters.every(f => item[f.field] === f.value)
        )
        return Promise.resolve({ items })
      },
    }
    return chain
  },

  insert(collection, item) {
    if (!store[collection]) store[collection] = []
    const saved = { ...item, _id: item._id || String(Date.now()) }
    store[collection].push(saved)
    return Promise.resolve(saved)
  },

  update(collection, item) {
    const idx = (store[collection] || []).findIndex(i => i._id === item._id)
    if (idx === -1) return Promise.reject(new Error('Item not found'))
    store[collection][idx] = { ...store[collection][idx], ...item }
    return Promise.resolve(store[collection][idx])
  },

  remove(collection, id) {
    if (!store[collection]) return Promise.resolve()
    store[collection] = store[collection].filter(i => i._id !== id)
    return Promise.resolve()
  },
}

module.exports = wixData
```

- [ ] **Step 6: Create `tests/__mocks__/wix-secrets-backend.js`**

```js
const secrets = {}

module.exports = {
  _reset() { Object.keys(secrets).forEach(k => delete secrets[k]) },
  _set(name, value) { secrets[name] = { id: name, name, value } },

  getSecret: jest.fn(name => {
    if (!secrets[name]) return Promise.reject(new Error(`Secret "${name}" not found`))
    return Promise.resolve(secrets[name].value)
  }),

  listSecretInfo: jest.fn(() =>
    Promise.resolve(Object.values(secrets).map(({ id, name }) => ({ id, name })))
  ),

  createSecret: jest.fn(({ name, value }) => {
    secrets[name] = { id: name, name, value }
    return Promise.resolve({ id: name })
  }),

  updateSecret: jest.fn((id, { value }) => {
    const entry = Object.values(secrets).find(s => s.id === id)
    if (entry) entry.value = value
    return Promise.resolve()
  }),
}
```

- [ ] **Step 7: Create `tests/__mocks__/wix-fetch.js`**

```js
const fetch = jest.fn()
module.exports = { fetch }
```

- [ ] **Step 8: Verify Jest runs**

```bash
npx jest --listTests
```
Expected: no errors, empty list (no tests yet).

- [ ] **Step 9: Commit**

```bash
git add package.json babel.config.js jest.config.js tests/
git commit -m "chore: add Jest test setup with Wix module mocks"
```

---

## Task 2: Create Wix Data Collections

**Files:**
- Manual: Wix Dashboard → Content Manager

- [ ] **Step 1: Open Wix Dashboard → Content Manager → + New Collection**

Create **ContactIdMap** with these fields:

| Field ID | Type |
|---|---|
| wixContactId | Text |
| hubspotContactId | Text |
| lastSyncedAt | Date and Time |
| lastSyncSource | Text |

- [ ] **Step 2: Add indexes to ContactIdMap**

In the collection settings → Indexes:
- Add index on `wixContactId`
- Add index on `hubspotContactId`

- [ ] **Step 3: Create **FieldMappings** collection**

| Field ID | Type |
|---|---|
| wixField | Text |
| hubspotProperty | Text |
| direction | Text |
| transform | Text |

- [ ] **Step 4: Create **SyncQueue** collection**

| Field ID | Type |
|---|---|
| syncId | Text |
| source | Text |
| eventType | Text |
| contactId | Text |
| payload | Text (store as JSON string) |
| status | Text |
| retryCount | Number |
| error | Text |

Add index on `syncId`. Add index on `status`.

- [ ] **Step 5: Create **SyncLog** collection**

| Field ID | Type |
|---|---|
| syncId | Text |
| source | Text |
| wixContactId | Text |
| hubspotContactId | Text |

Add index on `syncId`.

- [ ] **Step 6: Set collection permissions**

For **SyncLog** and **FieldMappings**: set Read + Write to "Admin only" (backend access only). Do this in each collection's Settings → Permissions.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "docs: record Wix Data collection schema"
```

---

## Task 3: Token Store Service

**Files:**
- Create: `src/backend/services/token-store.js`
- Create: `tests/backend/services/token-store.test.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/backend/services/token-store.test.js
const secretsMock = require('../../../tests/__mocks__/wix-secrets-backend')
jest.mock('wix-secrets-backend', () => secretsMock)

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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest tests/backend/services/token-store.test.js
```
Expected: FAIL — "Cannot find module"

- [ ] **Step 3: Create `src/backend/services/token-store.js`**

```js
import { getSecret, createSecret, updateSecret, listSecretInfo } from 'wix-secrets-backend'

const KEYS = ['hubspot_access_token', 'hubspot_refresh_token', 'hubspot_token_expiry', 'hubspot_portal_id']
const REFRESH_BUFFER_MS = 5 * 60 * 1000

async function upsertSecret(name, value) {
  const all = await listSecretInfo()
  const existing = all.find(s => s.name === name)
  if (existing) {
    await updateSecret(existing.id, { value: String(value) })
  } else {
    await createSecret({ name, value: String(value) })
  }
}

export async function getTokens() {
  try {
    const [accessToken, refreshToken, expiresAtStr, portalId] = await Promise.all(
      KEYS.map(k => getSecret(k))
    )
    return { accessToken, refreshToken, expiresAt: Number(expiresAtStr), portalId }
  } catch {
    return null
  }
}

export async function saveTokens({ accessToken, refreshToken, expiresAt, portalId }) {
  await Promise.all([
    upsertSecret('hubspot_access_token', accessToken),
    upsertSecret('hubspot_refresh_token', refreshToken),
    upsertSecret('hubspot_token_expiry', expiresAt),
    upsertSecret('hubspot_portal_id', portalId),
  ])
}

export async function clearTokens() {
  const all = await listSecretInfo()
  const ours = all.filter(s => KEYS.includes(s.name))
  await Promise.all(ours.map(s => updateSecret(s.id, { value: '' })))
}

export function needsRefresh(expiresAt) {
  return expiresAt - Date.now() < REFRESH_BUFFER_MS
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest tests/backend/services/token-store.test.js
```
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/backend/services/token-store.js tests/backend/services/token-store.test.js
git commit -m "feat: add token store service with SecretManager"
```

---

## Task 4: HubSpot API Client

**Files:**
- Create: `src/backend/services/hubspot-client.js`

> Note: This module calls external APIs — test coverage is handled via integration testing in Task 15. Unit tests would only be mocking fetch responses, which has low value. Write the implementation directly.

- [ ] **Step 1: Create `src/backend/services/hubspot-client.js`**

```js
import { fetch } from 'wix-fetch'
import { getTokens, saveTokens, needsRefresh } from './token-store'

const HS_BASE = 'https://api.hubspot.com'
const HS_AUTH = 'https://api.hubspot.com/oauth/v1/token'
const CLIENT_ID = 'REPLACE_WITH_HUBSPOT_CLIENT_ID'
const CLIENT_SECRET = 'REPLACE_WITH_HUBSPOT_CLIENT_SECRET'

async function getAccessToken() {
  const tokens = await getTokens()
  if (!tokens) throw new Error('HubSpot not connected')

  if (needsRefresh(tokens.expiresAt)) {
    const refreshed = await refreshAccessToken(tokens.refreshToken)
    await saveTokens(refreshed)
    return refreshed.accessToken
  }
  return tokens.accessToken
}

async function refreshAccessToken(refreshToken) {
  const res = await fetch(HS_AUTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&refresh_token=${refreshToken}`,
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`)
  const data = await res.json()
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    portalId: (await getTokens()).portalId,
  }
}

async function hsGet(path) {
  const token = await getAccessToken()
  const res = await fetch(`${HS_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`HubSpot GET ${path} failed: ${res.status}`)
  return res.json()
}

async function hsPost(path, body) {
  const token = await getAccessToken()
  const res = await fetch(`${HS_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`HubSpot POST ${path} failed: ${res.status} ${err}`)
  }
  return res.json()
}

async function hsPatch(path, body) {
  const token = await getAccessToken()
  const res = await fetch(`${HS_BASE}${path}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HubSpot PATCH ${path} failed: ${res.status}`)
  return res.json()
}

async function hsDelete(path) {
  const token = await getAccessToken()
  const res = await fetch(`${HS_BASE}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`HubSpot DELETE ${path} failed: ${res.status}`)
}

export async function exchangeCodeForTokens(code, redirectUri) {
  const res = await fetch(HS_AUTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=authorization_code&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`,
  })
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`)
  const data = await res.json()
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    portalId: String(data.hub_id),
  }
}

export async function getContact(hubspotContactId, properties = ['email', 'firstname', 'lastname', 'phone', 'hs_sync_id']) {
  return hsGet(`/crm/v3/objects/contacts/${hubspotContactId}?properties=${properties.join(',')}`)
}

export async function createContact(properties) {
  return hsPost('/crm/v3/objects/contacts', { properties })
}

export async function updateContact(hubspotContactId, properties) {
  return hsPatch(`/crm/v3/objects/contacts/${hubspotContactId}`, { properties })
}

export async function searchContactByEmail(email) {
  const result = await hsPost('/crm/v3/objects/contacts/search', {
    filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
    properties: ['email', 'firstname', 'lastname', 'phone', 'hs_sync_id'],
    limit: 1,
  })
  return result.results[0] || null
}

export async function getContactProperties() {
  const result = await hsGet('/crm/v3/properties/contacts?limit=100')
  return result.results.map(p => ({ name: p.name, label: p.label }))
}

export async function registerWebhook(appId, targetUrl) {
  return hsPost(`/webhooks/v3/${appId}/subscriptions`, {
    eventType: 'contact.propertyChange',
    propertyName: '*',
  })
}

export async function deregisterWebhook(appId, subscriptionId) {
  return hsDelete(`/webhooks/v3/${appId}/subscriptions/${subscriptionId}`)
}
```

- [ ] **Step 2: Store CLIENT_ID and CLIENT_SECRET in SecretManager (not in code)**

In Wix Dashboard → Secrets Manager, add:
- `hubspot_client_id` = your HubSpot app's client ID
- `hubspot_client_secret` = your HubSpot app's client secret

Then update `hubspot-client.js` to read them at runtime:

```js
// Replace the two const lines at the top of hubspot-client.js with:
let _clientId, _clientSecret

async function getCredentials() {
  if (!_clientId) {
    const { getSecret } = await import('wix-secrets-backend')
    _clientId = await getSecret('hubspot_client_id')
    _clientSecret = await getSecret('hubspot_client_secret')
  }
  return { clientId: _clientId, clientSecret: _clientSecret }
}
```

Then update every reference to `CLIENT_ID` / `CLIENT_SECRET` to call `await getCredentials()` and destructure.

- [ ] **Step 3: Commit**

```bash
git add src/backend/services/hubspot-client.js
git commit -m "feat: add HubSpot API client with token refresh"
```

---

## Task 5: Data Access Layer

**Files:**
- Create: `src/backend/data-access/contact-id-map.js`
- Create: `src/backend/data-access/field-mappings.js`
- Create: `src/backend/data-access/sync-queue.js`
- Create: `src/backend/data-access/sync-log.js`

- [ ] **Step 1: Create `src/backend/data-access/contact-id-map.js`**

```js
import wixData from 'wix-data'
const COLLECTION = 'ContactIdMap'
const OPTS = { suppressAuth: true }

export async function getByWixId(wixContactId) {
  const { items } = await wixData.query(COLLECTION).eq('wixContactId', wixContactId).find(OPTS)
  return items[0] || null
}

export async function getByHubspotId(hubspotContactId) {
  const { items } = await wixData.query(COLLECTION).eq('hubspotContactId', hubspotContactId).find(OPTS)
  return items[0] || null
}

export async function upsertMapping({ wixContactId, hubspotContactId, lastSyncSource }) {
  const existing = await getByWixId(wixContactId)
  const now = new Date()
  if (existing) {
    return wixData.update(COLLECTION, { ...existing, hubspotContactId, lastSyncedAt: now, lastSyncSource }, OPTS)
  }
  return wixData.insert(COLLECTION, { wixContactId, hubspotContactId, lastSyncedAt: now, lastSyncSource }, OPTS)
}

export async function countSynced() {
  const { items } = await wixData.query(COLLECTION).find(OPTS)
  return items.length
}
```

- [ ] **Step 2: Create `src/backend/data-access/field-mappings.js`**

```js
import wixData from 'wix-data'
const COLLECTION = 'FieldMappings'
const OPTS = { suppressAuth: true }

export async function getAllMappings() {
  const { items } = await wixData.query(COLLECTION).find(OPTS)
  return items
}

export async function saveMappings(mappings) {
  const existing = await getAllMappings()
  await Promise.all(existing.map(item => wixData.remove(COLLECTION, item._id, OPTS)))
  await Promise.all(mappings.map(m => wixData.insert(COLLECTION, m, OPTS)))
}

export function applyTransform(value, transform) {
  if (!value) return value
  if (transform === 'trim') return String(value).trim()
  if (transform === 'lowercase') return String(value).toLowerCase()
  return value
}
```

- [ ] **Step 3: Create `src/backend/data-access/sync-queue.js`**

```js
import wixData from 'wix-data'
const COLLECTION = 'SyncQueue'
const OPTS = { suppressAuth: true }

export async function enqueue({ syncId, source, eventType, contactId, payload }) {
  return wixData.insert(COLLECTION, {
    syncId,
    source,
    eventType,
    contactId,
    payload: JSON.stringify(payload),
    status: 'pending',
    retryCount: 0,
    error: null,
    _createdDate: new Date(),
  }, OPTS)
}

export async function getPendingBatch(limit = 10) {
  const { items } = await wixData.query(COLLECTION)
    .eq('status', 'pending')
    .find(OPTS)
  return items.slice(0, limit).map(item => ({
    ...item,
    payload: JSON.parse(item.payload || '{}'),
  }))
}

export async function markProcessing(id) {
  return wixData.update(COLLECTION, { _id: id, status: 'processing' }, OPTS)
}

export async function markDone(id) {
  return wixData.update(COLLECTION, { _id: id, status: 'done' }, OPTS)
}

export async function markFailed(id, error) {
  const { items } = await wixData.query(COLLECTION).eq('_id', id).find(OPTS)
  const item = items[0]
  if (!item) return
  const retryCount = (item.retryCount || 0) + 1
  const status = retryCount >= 3 ? 'failed' : 'pending'
  return wixData.update(COLLECTION, { _id: id, status, retryCount, error: String(error) }, OPTS)
}

export async function countLeads() {
  const { items } = await wixData.query(COLLECTION)
    .eq('eventType', 'form.submitted')
    .eq('status', 'done')
    .find(OPTS)
  return items.length
}
```

- [ ] **Step 4: Create `src/backend/data-access/sync-log.js`**

```js
import wixData from 'wix-data'
const COLLECTION = 'SyncLog'
const OPTS = { suppressAuth: true }
const TTL_MS = 24 * 60 * 60 * 1000

export async function logSync({ syncId, source, wixContactId, hubspotContactId }) {
  return wixData.insert(COLLECTION, {
    syncId,
    source,
    wixContactId,
    hubspotContactId,
    _createdDate: new Date(),
  }, OPTS)
}

export async function hasBeenProcessed(syncId) {
  const { items } = await wixData.query(COLLECTION).eq('syncId', syncId).find(OPTS)
  return items.length > 0
}

export async function getLastSyncForContact(wixContactId) {
  const { items } = await wixData.query(COLLECTION)
    .eq('wixContactId', wixContactId)
    .find(OPTS)
  if (!items.length) return null
  return items.sort((a, b) => new Date(b._createdDate) - new Date(a._createdDate))[0]
}

export async function purgeExpired() {
  const cutoff = new Date(Date.now() - TTL_MS)
  const { items } = await wixData.query(COLLECTION).find(OPTS)
  const expired = items.filter(i => new Date(i._createdDate) < cutoff)
  await Promise.all(expired.map(i => wixData.remove(COLLECTION, i._id, OPTS)))
}
```

- [ ] **Step 5: Commit**

```bash
git add src/backend/data-access/
git commit -m "feat: add data access layer for all four collections"
```

---

## Task 6: OAuth Flow

**Files:**
- Create: `src/backend/services/hubspot-oauth.js`
- Create: `src/backend/http-functions.js`

- [ ] **Step 1: Create `src/backend/services/hubspot-oauth.js`**

```js
import { exchangeCodeForTokens, registerWebhook, deregisterWebhook, getContactProperties } from './hubspot-client'
import { saveTokens, getTokens, clearTokens } from './token-store'

const SCOPES = [
  'crm.objects.contacts.read',
  'crm.objects.contacts.write',
  'crm.schemas.contacts.read',
  'webhooks',
].join(' ')

const HUBSPOT_APP_ID = 'REPLACE_WITH_APP_ID'

export async function buildAuthUrl(redirectUri) {
  const { getSecret } = await import('wix-secrets-backend')
  const clientId = await getSecret('hubspot_client_id')
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES,
  })
  return `https://app.hubspot.com/oauth/authorize?${params}`
}

export async function handleCallback(code, redirectUri) {
  const tokens = await exchangeCodeForTokens(code, redirectUri)
  await saveTokens(tokens)
  await registerWebhook(HUBSPOT_APP_ID, redirectUri.replace('oauth-callback', 'hubspot-webhook'))
  return tokens.portalId
}

export async function disconnect() {
  const tokens = await getTokens()
  if (tokens) {
    try {
      const subId = await _getWebhookSubscriptionId()
      if (subId) await deregisterWebhook(HUBSPOT_APP_ID, subId)
    } catch {
      // best-effort deregister
    }
  }
  await clearTokens()
}

export async function isConnected() {
  const tokens = await getTokens()
  return tokens !== null
}

async function _getWebhookSubscriptionId() {
  const { fetch } = await import('wix-fetch')
  const { accessToken } = await getTokens()
  const res = await fetch(`https://api.hubspot.com/webhooks/v3/${HUBSPOT_APP_ID}/subscriptions`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.results?.[0]?.id || null
}
```

- [ ] **Step 2: Create `src/backend/http-functions.js`**

```js
import { ok, serverError, badRequest } from 'wix-http-functions'
import { handleCallback } from './services/hubspot-oauth'
import { enqueue } from './data-access/sync-queue'
import { hasBeenProcessed } from './data-access/sync-log'
import { createHmac } from 'crypto'

const WEBHOOK_SECRET_NAME = 'hubspot_webhook_secret'

export async function get_oauthCallback(request) {
  try {
    const { code } = request.query
    if (!code) return badRequest({ body: JSON.stringify({ error: 'Missing code' }) })

    const redirectUri = `${request.baseUrl}/_functions/oauth-callback`
    const portalId = await handleCallback(code, redirectUri)

    return ok({
      headers: { Location: `https://${request.baseUrl}/dashboard/connect?connected=true` },
      body: JSON.stringify({ portalId }),
    })
  } catch (err) {
    console.error('OAuth callback error:', err.message)
    return serverError({ body: JSON.stringify({ error: 'OAuth failed' }) })
  }
}

export async function post_hubspotWebhook(request) {
  try {
    const rawBody = await request.body.text()
    const signature = request.headers['X-HubSpot-Signature-V3'] || request.headers['x-hubspot-signature-v3']

    const isValid = await verifyHmac(rawBody, signature)
    if (!isValid) return badRequest({ body: JSON.stringify({ error: 'Invalid signature' }) })

    const events = JSON.parse(rawBody)
    for (const event of events) {
      const syncId = `hs_${event.objectId}_${event.occurredAt}`
      const alreadyProcessed = await hasBeenProcessed(syncId)
      if (alreadyProcessed) continue

      const existingSyncId = event.propertyValue
      if (event.propertyName === 'hs_sync_id' && alreadyProcessed) continue

      await enqueue({
        syncId,
        source: 'hubspot',
        eventType: event.subscriptionType === 'contact.creation' ? 'contact.created' : 'contact.updated',
        contactId: String(event.objectId),
        payload: { [event.propertyName]: event.propertyValue, updatedAt: event.occurredAt },
      })
    }

    return ok({ body: JSON.stringify({ received: true }) })
  } catch (err) {
    console.error('Webhook error:', err.message)
    return serverError({ body: JSON.stringify({ error: 'Webhook processing failed' }) })
  }
}

async function verifyHmac(body, signature) {
  if (!signature) return false
  try {
    const { getSecret } = await import('wix-secrets-backend')
    const secret = await getSecret(WEBHOOK_SECRET_NAME)
    const expected = createHmac('sha256', secret).update(body).digest('hex')
    return expected === signature
  } catch {
    return false
  }
}
```

- [ ] **Step 3: Store `hubspot_webhook_secret` in SecretManager**

In your HubSpot app settings → Webhooks, copy the client secret and save it to Wix SecretManager as `hubspot_webhook_secret`.

- [ ] **Step 4: Commit**

```bash
git add src/backend/services/hubspot-oauth.js src/backend/http-functions.js
git commit -m "feat: add OAuth flow and HTTP functions for callback + webhook"
```

---

## Task 7: Contact Mapper + Loop Guard

**Files:**
- Create: `src/backend/services/contact-mapper.js`
- Create: `src/backend/services/loop-guard.js`
- Create: `tests/backend/services/contact-mapper.test.js`
- Create: `tests/backend/services/loop-guard.test.js`

- [ ] **Step 1: Write failing tests for contact-mapper**

```js
// tests/backend/services/contact-mapper.test.js
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest tests/backend/services/contact-mapper.test.js
```
Expected: FAIL — "Cannot find module"

- [ ] **Step 3: Create `src/backend/services/contact-mapper.js`**

```js
import { applyTransform } from '../data-access/field-mappings'

export function shouldSyncField(mapping, source) {
  if (mapping.direction === 'both') return true
  if (mapping.direction === 'wix_to_hs') return source === 'wix'
  if (mapping.direction === 'hs_to_wix') return source === 'hubspot'
  return false
}

export function buildSyncPayload(sourceData, mappings, source) {
  const result = {}
  for (const mapping of mappings) {
    if (!shouldSyncField(mapping, source)) continue

    const sourceKey = source === 'wix' ? mapping.wixField : mapping.hubspotProperty
    const targetKey = source === 'wix' ? mapping.hubspotProperty : mapping.wixField

    if (!(sourceKey in sourceData)) continue

    const raw = sourceData[sourceKey]
    result[targetKey] = applyTransform(raw, mapping.transform)
  }
  return result
}

export function hasChanged(currentData, incomingData) {
  return Object.entries(incomingData).some(
    ([key, val]) => currentData[key] !== val
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest tests/backend/services/contact-mapper.test.js
```
Expected: PASS (8 tests)

- [ ] **Step 5: Write failing tests for loop-guard**

```js
// tests/backend/services/loop-guard.test.js
const wixDataMock = require('../../../tests/__mocks__/wix-data')
jest.mock('wix-data', () => wixDataMock)

const { isOwnEcho, taggedWithSyncId } = require('../../../src/backend/services/loop-guard')

beforeEach(() => wixDataMock._reset())

test('isOwnEcho returns true when syncId exists in SyncLog', async () => {
  wixDataMock._store['SyncLog'] = [{ _id: '1', syncId: 'abc-123', source: 'wix' }]
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
```

- [ ] **Step 6: Create `src/backend/services/loop-guard.js`**

```js
import { hasBeenProcessed } from '../data-access/sync-log'

export async function isOwnEcho(syncId) {
  return hasBeenProcessed(syncId)
}

export function taggedWithSyncId(payload) {
  return payload?.hs_sync_id || null
}
```

- [ ] **Step 7: Run all tests**

```bash
npx jest tests/backend/services/
```
Expected: PASS (12 tests total)

- [ ] **Step 8: Commit**

```bash
git add src/backend/services/contact-mapper.js src/backend/services/loop-guard.js tests/backend/services/
git commit -m "feat: add contact mapper and loop guard services"
```

---

## Task 8: Wix Contact Event Handlers

**Files:**
- Create: `src/backend/events/contacts.js`

- [ ] **Step 1: Create `src/backend/events/contacts.js`**

```js
import { enqueue } from '../data-access/sync-queue'
import { isOwnEcho, taggedWithSyncId } from '../services/loop-guard'
import { v4 as uuidv4 } from 'uuid'

export async function wixCrm_onContactCreated(event) {
  const { contactId, primaryEmail, firstName, lastName, phones } = event.entity

  const existingTag = taggedWithSyncId(event.entity)
  if (existingTag && await isOwnEcho(existingTag)) return

  const syncId = uuidv4()
  await enqueue({
    syncId,
    source: 'wix',
    eventType: 'contact.created',
    contactId,
    payload: {
      email: primaryEmail?.email,
      firstName,
      lastName,
      phone: phones?.[0]?.phone,
      updatedAt: Date.now(),
    },
  })
}

export async function wixCrm_onContactUpdated(event) {
  const { contactId, primaryEmail, firstName, lastName, phones } = event.entity

  const existingTag = taggedWithSyncId(event.entity)
  if (existingTag && await isOwnEcho(existingTag)) return

  const syncId = uuidv4()
  await enqueue({
    syncId,
    source: 'wix',
    eventType: 'contact.updated',
    contactId,
    payload: {
      email: primaryEmail?.email,
      firstName,
      lastName,
      phone: phones?.[0]?.phone,
      updatedAt: new Date(event.metadata?.updatedAt || Date.now()).getTime(),
    },
  })
}
```

- [ ] **Step 2: Install uuid**

```bash
npm install uuid
```

- [ ] **Step 3: Commit**

```bash
git add src/backend/events/contacts.js package.json package-lock.json
git commit -m "feat: add Wix contact event handlers to produce SyncQueue items"
```

---

## Task 9: Sync Worker (Queue Processor)

**Files:**
- Create: `src/backend/jobs/sync-worker.js`

- [ ] **Step 1: Create `src/backend/jobs/sync-worker.js`**

```js
import { getPendingBatch, markProcessing, markDone, markFailed } from '../data-access/sync-queue'
import { logSync, hasBeenProcessed, purgeExpired } from '../data-access/sync-log'
import { getByWixId, getByHubspotId, upsertMapping } from '../data-access/contact-id-map'
import { getAllMappings } from '../data-access/field-mappings'
import { buildSyncPayload, hasChanged } from '../services/contact-mapper'
import { getContact, updateContact, createContact } from '../services/hubspot-client'
import { contacts as wixContacts } from 'wix-crm-backend'
import { v4 as uuidv4 } from 'uuid'

export async function processSyncQueue() {
  await purgeExpired()
  const batch = await getPendingBatch(10)
  if (!batch.length) return

  const mappings = await getAllMappings()

  for (const item of batch) {
    await markProcessing(item._id)
    try {
      await processItem(item, mappings)
      await markDone(item._id)
    } catch (err) {
      console.error(`Sync failed for queue item ${item._id}:`, err.message)
      await markFailed(item._id, err.message)
    }
  }
}

async function processItem(item, mappings) {
  const alreadyProcessed = await hasBeenProcessed(item.syncId)
  if (alreadyProcessed) return

  if (item.source === 'wix') {
    await syncWixContactToHubspot(item, mappings)
  } else {
    await syncHubspotContactToWix(item, mappings)
  }
}

async function syncWixContactToHubspot(item, mappings) {
  const hsPayload = buildSyncPayload(item.payload, mappings, 'wix')
  hsPayload.hs_sync_id = item.syncId

  let mapping = await getByWixId(item.contactId)

  if (mapping) {
    const current = await getContact(mapping.hubspotContactId)
    if (!hasChanged(current.properties, hsPayload)) return
    await updateContact(mapping.hubspotContactId, hsPayload)
  } else {
    const created = await createContact(hsPayload)
    mapping = { wixContactId: item.contactId, hubspotContactId: created.id }
    await upsertMapping({ ...mapping, lastSyncSource: 'wix' })
  }

  await logSync({
    syncId: item.syncId,
    source: 'wix',
    wixContactId: item.contactId,
    hubspotContactId: mapping.hubspotContactId,
  })
}

async function syncHubspotContactToWix(item, mappings) {
  const wixPayload = buildSyncPayload(item.payload, mappings, 'hubspot')
  wixPayload._sync_id = item.syncId

  let mapping = await getByHubspotId(item.contactId)

  if (mapping) {
    await wixContacts.updateContact(mapping.wixContactId, wixPayload)
  } else {
    const created = await wixContacts.createContact(wixPayload)
    mapping = { wixContactId: created.contactId, hubspotContactId: item.contactId }
    await upsertMapping({ ...mapping, lastSyncSource: 'hubspot' })
  }

  await logSync({
    syncId: item.syncId,
    source: 'hubspot',
    wixContactId: mapping.wixContactId,
    hubspotContactId: item.contactId,
  })
}
```

- [ ] **Step 2: Configure scheduled job in `wix.config.json`**

Add to the `jobs` array:
```json
{
  "jobs": [
    {
      "functionLocation": "/backend/jobs/sync-worker",
      "executionConfig": {
        "cronExpression": "* * * * *"
      }
    }
  ]
}
```

The exported function name must match what Wix calls. Add this export alias at the bottom of `sync-worker.js`:
```js
// Wix Scheduler calls the exported function by its name in jobs config.
// The default export name must be "default" or match the config.
export { processSyncQueue as default }
```

- [ ] **Step 3: Commit**

```bash
git add src/backend/jobs/sync-worker.js wix.config.json
git commit -m "feat: add sync worker with queue processing and loop prevention"
```

---

## Task 10: UTM Enricher + Form Capture

**Files:**
- Create: `src/backend/services/utm-enricher.js`
- Create: `src/backend/events/forms.js`
- Create: `tests/backend/services/utm-enricher.test.js`

- [ ] **Step 1: Write failing tests for utm-enricher**

```js
// tests/backend/services/utm-enricher.test.js
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
```

- [ ] **Step 2: Run to confirm they fail**

```bash
npx jest tests/backend/services/utm-enricher.test.js
```
Expected: FAIL

- [ ] **Step 3: Create `src/backend/services/utm-enricher.js`**

```js
const UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'page_url', 'referrer']

export function extractUtmFields(formData) {
  return UTM_FIELDS.reduce((acc, key) => {
    if (key in formData && formData[key]) acc[key] = formData[key]
    return acc
  }, {})
}

export function buildAttributionProperties(utm, submittedAtMs) {
  return {
    utm_source: utm.utm_source,
    utm_medium: utm.utm_medium,
    utm_campaign: utm.utm_campaign,
    utm_content: utm.utm_content,
    utm_term: utm.utm_term,
    original_source_url: utm.page_url,
    original_referrer: utm.referrer,
    first_form_submitted_at: new Date(submittedAtMs).toISOString(),
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest tests/backend/services/utm-enricher.test.js
```
Expected: PASS (3 tests)

- [ ] **Step 5: Create `src/backend/events/forms.js`**

```js
import { getAllMappings } from '../data-access/field-mappings'
import { getByWixId, upsertMapping } from '../data-access/contact-id-map'
import { logSync } from '../data-access/sync-log'
import { buildSyncPayload } from '../services/contact-mapper'
import { extractUtmFields, buildAttributionProperties } from '../services/utm-enricher'
import { searchContactByEmail, createContact, updateContact } from '../services/hubspot-client'
import { v4 as uuidv4 } from 'uuid'

export async function wixForms_onFormSubmit(event) {
  const { submission } = event
  const formData = submission.submissionData || {}
  const email = formData.email

  if (!email) return

  const mappings = await getAllMappings()
  const utm = extractUtmFields(formData)
  const syncId = uuidv4()

  const baseProps = buildSyncPayload(formData, mappings, 'wix')
  const attributionProps = buildAttributionProperties(utm, Date.now())

  const hsProperties = {
    ...baseProps,
    ...attributionProps,
    hs_sync_id: syncId,
  }

  const existingHsContact = await searchContactByEmail(email)

  let hubspotContactId
  if (existingHsContact) {
    hubspotContactId = existingHsContact.id
    await updateContact(hubspotContactId, hsProperties)
  } else {
    const created = await createContact(hsProperties)
    hubspotContactId = created.id
  }

  await upsertMapping({
    wixContactId: submission.contactId || `form_${syncId}`,
    hubspotContactId,
    lastSyncSource: 'wix',
  })

  await logSync({
    syncId,
    source: 'wix',
    wixContactId: submission.contactId || `form_${syncId}`,
    hubspotContactId,
  })
}
```

- [ ] **Step 6: Add UTM hidden fields to the Wix form (frontend)**

In the Wix Editor, open the form → Add hidden fields named exactly:
`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `page_url`, `referrer`

Add this to the page's code (Wix Editor → Page Code):
```js
import wixLocation from 'wix-location'
import { formFields } from 'wix-forms'

$w.onReady(function () {
  const params = wixLocation.query
  const fields = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']
  fields.forEach(f => {
    if (params[f]) {
      try { $w(`#${f}`).value = params[f] } catch {}
    }
  })
  try { $w('#page_url').value = wixLocation.url } catch {}
  try { $w('#referrer').value = document.referrer } catch {}
})
```

- [ ] **Step 7: Run all tests**

```bash
npx jest
```
Expected: PASS (all tests)

- [ ] **Step 8: Commit**

```bash
git add src/backend/services/utm-enricher.js src/backend/events/forms.js tests/backend/services/utm-enricher.test.js
git commit -m "feat: add form capture with UTM enrichment"
```

---

## Task 11: Dashboard — Connect Page

**Files:**
- Create: `src/dashboard/pages/connect/page.jsx`

- [ ] **Step 1: Create `src/dashboard/pages/connect/page.jsx`**

```jsx
import React, { useEffect, useState } from 'react'
import { dashboard } from '@wix/dashboard'
import { httpClient } from '@wix/essentials'

const STATS_POLL_MS = 30000

export default function ConnectPage() {
  const [status, setStatus] = useState({ loading: true, connected: false, portalId: null })
  const [stats, setStats] = useState({ synced: 0, leads: 0, lastSync: null })

  useEffect(() => {
    checkConnection()
    const interval = setInterval(checkConnection, STATS_POLL_MS)
    return () => clearInterval(interval)
  }, [])

  async function checkConnection() {
    try {
      const res = await httpClient.fetchWithAuth('/_functions/connection-status')
      const data = await res.json()
      setStatus({ loading: false, connected: data.connected, portalId: data.portalId })
      if (data.connected) setStats(data.stats || stats)
    } catch {
      setStatus(s => ({ ...s, loading: false }))
    }
  }

  async function handleConnect() {
    const res = await httpClient.fetchWithAuth('/_functions/start-oauth')
    const { authUrl } = await res.json()
    window.location.href = authUrl
  }

  async function handleDisconnect() {
    if (!window.confirm('Disconnect HubSpot? Sync will stop immediately.')) return
    await httpClient.fetchWithAuth('/_functions/disconnect', { method: 'POST' })
    setStatus({ loading: false, connected: false, portalId: null })
  }

  if (status.loading) return <div style={styles.page}><p style={styles.muted}>Loading...</p></div>

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>HubSpot Connection</h1>
          <p style={styles.subtitle}>Connect your HubSpot account to sync contacts and capture leads.</p>
        </div>
        <span style={status.connected ? styles.badgeConnected : styles.badgeDisconnected}>
          {status.connected ? '● Connected' : '○ Not connected'}
        </span>
      </div>

      {status.connected && (
        <>
          <div style={styles.statsRow}>
            <Stat label="Contacts Synced" value={stats.synced} />
            <Stat label="Leads Captured" value={stats.leads} />
            <Stat label="Last Sync" value={stats.lastSync ? timeAgo(stats.lastSync) : 'Never'} />
          </div>
          <p style={styles.portal}>Portal ID: {status.portalId}</p>
          <div style={styles.actions}>
            <button style={styles.btnDanger} onClick={handleDisconnect}>Disconnect HubSpot</button>
            <button style={styles.btnSecondary} onClick={() => dashboard.navigate({ pageId: 'field-mapping' })}>
              Field Mappings
            </button>
          </div>
        </>
      )}

      {!status.connected && (
        <button style={styles.btnPrimary} onClick={handleConnect}>Connect HubSpot</button>
      )}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  )
}

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}

const styles = {
  page: { padding: 24, maxWidth: 640, fontFamily: 'sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: 700, margin: '0 0 4px' },
  subtitle: { fontSize: 13, color: '#666', margin: 0 },
  badgeConnected: { background: '#d1fae5', color: '#065f46', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600 },
  badgeDisconnected: { background: '#f3f4f6', color: '#6b7280', padding: '4px 12px', borderRadius: 20, fontSize: 12 },
  statsRow: { display: 'flex', gap: 16, marginBottom: 16 },
  stat: { flex: 1, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 16px', textAlign: 'center' },
  statValue: { fontSize: 22, fontWeight: 700, color: '#111' },
  statLabel: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  portal: { fontSize: 12, color: '#9ca3af', marginBottom: 16 },
  actions: { display: 'flex', gap: 10 },
  btnPrimary: { background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 20px', cursor: 'pointer', fontSize: 14 },
  btnDanger: { background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 13 },
  btnSecondary: { background: '#ede9fe', color: '#7c3aed', border: '1px solid #c4b5fd', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 13 },
  muted: { color: '#9ca3af' },
}
```

- [ ] **Step 2: Add supporting HTTP functions to `http-functions.js`**

Add these three functions to `src/backend/http-functions.js`:

```js
import { isConnected, buildAuthUrl, disconnect as doDisconnect } from './services/hubspot-oauth'
import { getTokens } from './services/token-store'
import { countSynced } from './data-access/contact-id-map'
import { countLeads } from './data-access/sync-queue'
import { getLastSyncForContact } from './data-access/sync-log'

export async function get_connectionStatus(request) {
  try {
    const connected = await isConnected()
    if (!connected) return ok({ body: JSON.stringify({ connected: false }) })

    const tokens = await getTokens()
    const [synced, leads] = await Promise.all([countSynced(), countLeads()])
    return ok({ body: JSON.stringify({ connected: true, portalId: tokens.portalId, stats: { synced, leads, lastSync: new Date().toISOString() } }) })
  } catch (err) {
    return serverError({ body: JSON.stringify({ error: err.message }) })
  }
}

export async function get_startOauth(request) {
  const redirectUri = `${request.baseUrl}/_functions/oauth-callback`
  const authUrl = await buildAuthUrl(redirectUri)
  return ok({ body: JSON.stringify({ authUrl }) })
}

export async function post_disconnect(request) {
  try {
    await doDisconnect()
    return ok({ body: JSON.stringify({ disconnected: true }) })
  } catch (err) {
    return serverError({ body: JSON.stringify({ error: err.message }) })
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/dashboard/pages/connect/page.jsx src/backend/http-functions.js
git commit -m "feat: add connect/disconnect dashboard page"
```

---

## Task 12: Dashboard — Field Mapping Page

**Files:**
- Create: `src/dashboard/pages/field-mapping/page.jsx`

- [ ] **Step 1: Add field-mapping HTTP functions to `http-functions.js`**

```js
import { getAllMappings, saveMappings } from './data-access/field-mappings'
import { getContactProperties } from './services/hubspot-client'

export async function get_fieldMappings(request) {
  try {
    const [mappings, hsProps] = await Promise.all([getAllMappings(), getContactProperties()])
    const wixFields = ['email', 'firstName', 'lastName', 'phone', 'company', 'address', 'birthdate']
    return ok({ body: JSON.stringify({ mappings, hsProps, wixFields }) })
  } catch (err) {
    return serverError({ body: JSON.stringify({ error: err.message }) })
  }
}

export async function post_saveFieldMappings(request) {
  try {
    const body = await request.body.json()
    const { mappings } = body

    const seen = new Set()
    for (const m of mappings) {
      if (seen.has(m.hubspotProperty)) {
        return badRequest({ body: JSON.stringify({ error: `Duplicate HubSpot property: ${m.hubspotProperty}` }) })
      }
      seen.add(m.hubspotProperty)
    }

    await saveMappings(mappings)
    return ok({ body: JSON.stringify({ saved: true }) })
  } catch (err) {
    return serverError({ body: JSON.stringify({ error: err.message }) })
  }
}
```

- [ ] **Step 2: Create `src/dashboard/pages/field-mapping/page.jsx`**

```jsx
import React, { useEffect, useState } from 'react'
import { httpClient } from '@wix/essentials'

const DIRECTIONS = [
  { value: 'both', label: '⇄ Both' },
  { value: 'wix_to_hs', label: '→ Wix only' },
  { value: 'hs_to_wix', label: '← HS only' },
]
const TRANSFORMS = ['none', 'trim', 'lowercase']

export default function FieldMappingPage() {
  const [rows, setRows] = useState([])
  const [wixFields, setWixFields] = useState([])
  const [hsProps, setHsProps] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      const res = await httpClient.fetchWithAuth('/_functions/field-mappings')
      const { mappings, wixFields: wf, hsProps: hp } = await res.json()
      setWixFields(wf)
      setHsProps(hp)
      setRows(mappings.length ? mappings : [emptyRow()])
    } catch (err) {
      setError('Failed to load mappings')
    }
  }

  function emptyRow() {
    return { wixField: '', hubspotProperty: '', direction: 'both', transform: 'none' }
  }

  function updateRow(index, field, value) {
    setRows(rows.map((r, i) => i === index ? { ...r, [field]: value } : r))
  }

  function addRow() { setRows([...rows, emptyRow()]) }
  function removeRow(index) { setRows(rows.filter((_, i) => i !== index)) }

  async function handleSave() {
    const valid = rows.filter(r => r.wixField && r.hubspotProperty)
    const seen = new Set()
    for (const r of valid) {
      if (seen.has(r.hubspotProperty)) {
        setError(`Duplicate HubSpot property: "${r.hubspotProperty}"`)
        return
      }
      seen.add(r.hubspotProperty)
    }

    setSaving(true)
    setError(null)
    try {
      const res = await httpClient.fetchWithAuth('/_functions/save-field-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: valid }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Field Mappings</h1>
          <p style={styles.subtitle}>Map Wix contact fields to HubSpot properties. Changes take effect on the next sync.</p>
        </div>
        <button style={styles.btnAdd} onClick={addRow}>+ Add Mapping</button>
      </div>

      {error && <div style={styles.error}>{error}</div>}
      {saved && <div style={styles.success}>Mappings saved.</div>}

      <table style={styles.table}>
        <thead>
          <tr>
            {['Wix Field', 'HubSpot Property', 'Direction', 'Transform', ''].map(h => (
              <th key={h} style={styles.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td style={styles.td}>
                <select style={styles.select} value={row.wixField} onChange={e => updateRow(i, 'wixField', e.target.value)}>
                  <option value="">Select field</option>
                  {wixFields.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </td>
              <td style={styles.td}>
                <select style={styles.select} value={row.hubspotProperty} onChange={e => updateRow(i, 'hubspotProperty', e.target.value)}>
                  <option value="">Select property</option>
                  {hsProps.map(p => <option key={p.name} value={p.name}>{p.label} ({p.name})</option>)}
                </select>
              </td>
              <td style={styles.td}>
                <select style={styles.select} value={row.direction} onChange={e => updateRow(i, 'direction', e.target.value)}>
                  {DIRECTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </td>
              <td style={styles.td}>
                <select style={styles.select} value={row.transform} onChange={e => updateRow(i, 'transform', e.target.value)}>
                  {TRANSFORMS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </td>
              <td style={styles.td}>
                <button style={styles.btnRemove} onClick={() => removeRow(i)}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={styles.footer}>
        <button style={saving ? styles.btnSavingDisabled : styles.btnSave} onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Mappings'}
        </button>
      </div>
    </div>
  )
}

const styles = {
  page: { padding: 24, fontFamily: 'sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: 700, margin: '0 0 4px' },
  subtitle: { fontSize: 13, color: '#666', margin: 0 },
  table: { width: '100%', borderCollapse: 'collapse', marginBottom: 16 },
  th: { background: '#f3f0ff', color: '#7c3aed', padding: '8px 10px', textAlign: 'left', border: '1px solid #e5e7eb', fontSize: 12, fontWeight: 600 },
  td: { padding: '6px 8px', border: '1px solid #e5e7eb' },
  select: { width: '100%', padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12 },
  btnAdd: { background: '#ede9fe', color: '#7c3aed', border: '1px solid #c4b5fd', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 12 },
  btnRemove: { background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 },
  btnSave: { background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 24px', cursor: 'pointer', fontSize: 14 },
  btnSavingDisabled: { background: '#a5b4fc', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 24px', cursor: 'not-allowed', fontSize: 14 },
  footer: { display: 'flex', justifyContent: 'flex-end' },
  error: { background: '#fee2e2', color: '#dc2626', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 },
  success: { background: '#d1fae5', color: '#065f46', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 },
}
```

- [ ] **Step 3: Commit**

```bash
git add src/dashboard/pages/field-mapping/page.jsx src/backend/http-functions.js
git commit -m "feat: add field mapping dashboard page with save/load"
```

---

## Task 13: Deploy + Smoke Test

**Files:**
- Modify: `wix.config.json` (verify app ID + job config)

- [ ] **Step 1: Run all unit tests one final time**

```bash
npx jest
```
Expected: PASS (all tests)

- [ ] **Step 2: Start Wix dev server**

```bash
npx wix dev
```
Expected: Dashboard opens in browser with your two pages listed in sidebar.

- [ ] **Step 3: Smoke test OAuth connect**

1. Open the Connect page in your Wix dashboard
2. Click "Connect HubSpot"
3. Complete OAuth on HubSpot's screen
4. Verify dashboard shows "Connected" + portal ID

- [ ] **Step 4: Smoke test field mappings**

1. Open Field Mappings page
2. Add: `email` → `email`, direction `Both`
3. Add: `firstName` → `firstname`, direction `Both`
4. Click "Save Mappings"
5. Verify "Mappings saved" toast appears
6. Reload page — verify mappings persist

- [ ] **Step 5: Smoke test form capture**

1. Publish your Wix site with a form that has `email` and `firstName` fields
2. Add UTM hidden fields as per Task 10 Step 6
3. Submit form with `?utm_source=test&utm_medium=smoke` in URL
4. Verify new contact appears in HubSpot with `utm_source=test` property

- [ ] **Step 6: Smoke test bi-directional sync**

1. Create a new Wix contact via Wix CRM dashboard
2. Wait up to 1 minute
3. Verify contact appears in HubSpot with correct properties
4. Update a field in HubSpot
5. Wait up to 1 minute
6. Verify Wix contact reflects the update
7. Confirm no infinite loop: check SyncLog collection — entry count should stop growing after 2 entries

- [ ] **Step 7: Deploy to production**

```bash
npx wix build
npx wix deploy
```

- [ ] **Step 8: Publish GitHub repo and submit**

```bash
git remote add origin https://github.com/YOUR_USERNAME/wix-hubspot-integration.git
git push -u origin master
```

Submit:
- GitHub repo URL
- Wix username to install the app for review

- [ ] **Step 9: Final commit**

```bash
git add .
git commit -m "chore: finalize deploy config"
```

---

## Running All Tests

```bash
npx jest --coverage
```

Expected output:
```
PASS tests/backend/services/token-store.test.js
PASS tests/backend/services/contact-mapper.test.js
PASS tests/backend/services/loop-guard.test.js
PASS tests/backend/services/utm-enricher.test.js

Test Suites: 4 passed
Tests:       20 passed
```
