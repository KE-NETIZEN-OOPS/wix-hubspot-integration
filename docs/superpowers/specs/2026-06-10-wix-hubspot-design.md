# Wix ↔ HubSpot Integration — Design Spec

**Date:** 2026-06-10  
**Status:** Approved

---

## Decisions Summary

| Decision | Choice |
|---|---|
| App model | Wix CLI (backend on Wix Functions, no external hosting) |
| Form integration | Wix native forms → push to HubSpot on submit |
| Conflict resolution | Per-field direction configured in Field Mapping UI |
| Sync engine | Hybrid — forms sync immediately, contact updates async via SyncQueue |

---

## Section 1 — Architecture Overview

### Layers

**Wix Dashboard (React)**
- Connect / Disconnect HubSpot page
- Field Mapping Table page
- Sync Status + last-sync log view

**Wix Functions (backend)**
- `hubspot-oauth.js` — build auth URL, handle OAuth callback, token refresh
- `contact-sync.js` — Wix contact event handler, writes to SyncQueue
- `form-capture.js` — Wix form submission handler, syncs to HubSpot immediately
- `sync-worker.js` — scheduled job (every 1 min, Wix Scheduler minimum), processes SyncQueue
- HTTP Function `/_functions/hubspot-webhook` — receives inbound HubSpot webhooks
- HTTP Function `/_functions/oauth-callback` — receives HubSpot OAuth redirect

**Wix Data (storage)**
- `ContactIdMap`, `FieldMappings`, `SyncQueue`, `SyncLog` collections
- Wix SecretManager for OAuth tokens (never in a collection)

### Data Flows

**Form capture (synchronous)**
```
Wix form submit
→ form-capture.js
→ enrich with UTM params + referrer + page URL
→ HubSpot Contacts API (create/update)
→ update ContactIdMap
```

**Contact sync (asynchronous)**
```
Wix contact event OR HubSpot webhook
→ write to SyncQueue (fast, no API call)
→ sync-worker.js picks up every 1 min
→ dedup → field direction check → write to target → log
```

**OAuth connect**
```
Dashboard → hubspot-oauth.js → redirect to HubSpot
→ /_functions/oauth-callback receives code
→ exchange for tokens → store in SecretManager
→ register HubSpot webhook subscription
```

---

## Section 2 — Data Model

### ContactIdMap
| Field | Type | Notes |
|---|---|---|
| wixContactId | String | indexed |
| hubspotContactId | String | indexed |
| lastSyncedAt | Date | |
| lastSyncSource | `"wix"` \| `"hubspot"` | |

One row per contact pair. Both IDs indexed for O(1) lookup in either direction.

### FieldMappings
| Field | Type | Notes |
|---|---|---|
| wixField | String | e.g. `"email"`, `"firstName"` |
| hubspotProperty | String | unique — no duplicate HS property |
| direction | `"wix_to_hs"` \| `"hs_to_wix"` \| `"both"` | |
| transform | `"none"` \| `"trim"` \| `"lowercase"` | |

Read by the sync engine on every event. User-editable via dashboard table.

### SyncQueue
| Field | Type | Notes |
|---|---|---|
| syncId | String (UUID) | indexed |
| source | `"wix"` \| `"hubspot"` | |
| eventType | `"contact.created"` \| `"contact.updated"` | |
| contactId | String | source-side contact ID |
| payload | JSON | fields to sync |
| status | `"pending"` \| `"processing"` \| `"done"` \| `"failed"` | |
| retryCount | Number | max 3 |
| createdAt | Date | |
| error | String | nullable, last error message |

Polled every 1 min by `sync-worker.js`. Retried up to 3× with backoff on failure.

### SyncLog
| Field | Type | Notes |
|---|---|---|
| syncId | String | indexed, TTL 24h |
| source | `"wix"` \| `"hubspot"` | |
| wixContactId | String | |
| hubspotContactId | String | |
| createdAt | Date | |

Dedup store. Worker checks this before processing any queue item. Rows expire after 24h to keep collection small.

### SecretManager keys
| Key | Value |
|---|---|
| `hubspot_access_token` | refreshed automatically |
| `hubspot_refresh_token` | used to get new access token |
| `hubspot_token_expiry` | unix timestamp |
| `hubspot_portal_id` | for dashboard display only |

Tokens are never written to Wix Data collections and never exposed to the browser.

---

## Section 3 — Sync Engine + Loop Prevention

### Event Capture

**Wix → HubSpot:**
1. Wix fires `onContactCreated` / `onContactUpdated`
2. `contact-sync.js` receives event
3. Generate `syncId = UUID()`
4. Write to `SyncQueue` with `source: "wix"`, status `"pending"`

**HubSpot → Wix:**
1. HubSpot fires `contact.propertyChange` webhook
2. `/_functions/hubspot-webhook` receives it
3. Verify HMAC signature
4. Generate `syncId = UUID()`
5. Write to `SyncQueue` with `source: "hubspot"`, status `"pending"`

### sync-worker.js — Processing Loop (every 30s)

For each pending row (batch of 10):

1. **Dedup check** — is `syncId` in `SyncLog`? → YES → skip, mark done
2. **Resolve contact** — look up `ContactIdMap` → get both IDs
3. **Load field mappings** — filter by direction appropriate to source
4. **Compare values** — skip fields where source value = destination value (idempotent)
5. **Timestamp check** — for `"both"` direction fields: last-write-wins using `updatedAt`
6. **Write to target** — call HubSpot API or Wix Contacts API; tag write with `syncId`
7. **Log syncId** — write to `SyncLog` (TTL 24h); mark queue row `"done"`

On error: increment `retryCount`. If `retryCount >= 3` → mark `"failed"`, log error message.

### Loop Prevention (two-layer defence)

**Layer 1 — Tag writes:**
- When worker writes to HubSpot → sets `hs_sync_id` contact property = `syncId`
- When worker writes to Wix → stores `syncId` in contact's custom field

**Layer 2 — Check on receive:**
- When Wix event fires → read contact's `sync_id` field. If matches last `syncId` in `SyncLog` → DROP (own echo)
- When HubSpot webhook fires → read `hs_sync_id` from payload. If matches last `syncId` in `SyncLog` → DROP (own echo)

**Fallback — SyncLog dedup:**
- Even if tag check is missed, worker checks `SyncLog` at step 1 → duplicate `syncId` → skip

### Per-Field Direction Logic

| Direction | Wix → HS event | HS → Wix event | Conflict rule |
|---|---|---|---|
| `wix_to_hs` | ✅ copy field | ⛔ skip field | Wix always wins |
| `hs_to_wix` | ⛔ skip field | ✅ copy field | HubSpot always wins |
| `both` | ✅ copy field | ✅ copy field | Last `updatedAt` wins |

---

## Section 4 — OAuth + Field Mapping UI

### OAuth Scopes (least privilege)
```
crm.objects.contacts.read
crm.objects.contacts.write
crm.schemas.contacts.read
webhooks
```

### Connect Flow
1. User clicks "Connect HubSpot" in dashboard
2. `hubspot-oauth.js` builds auth URL with scopes + `redirect_uri = /_functions/oauth-callback`
3. Browser redirects to HubSpot OAuth consent screen
4. User approves → HubSpot redirects to `/_functions/oauth-callback?code=xxx`
5. `oauth-callback.js` exchanges code for `access_token` + `refresh_token`
6. Tokens written to SecretManager (server-side only, never returned to browser)
7. Dashboard polls and shows "Connected" state with portal ID
8. Register HubSpot webhook subscription for `contact.propertyChange` + `contact.creation`

### Disconnect Flow
1. User clicks "Disconnect"
2. Delete all keys from SecretManager
3. Call HubSpot API to deregister webhook subscription
4. Dashboard shows "Not connected"

### Token Refresh (automatic)
- Before every HubSpot API call: read `hubspot_token_expiry` from SecretManager
- If `expiry - now < 5 min` → POST `/oauth/v1/token` with `refresh_token`
- Write new `access_token` + `expiry` to SecretManager
- Proceed with original call

### Dashboard — Connect Page
- Connection status badge (Connected / Not connected)
- Stats: contacts synced, leads captured, last sync timestamp
- "Disconnect HubSpot" button (red, destructive)
- "View Sync Log" button

### Dashboard — Field Mapping Table
Columns: **Wix Field** (dropdown) | **HubSpot Property** (dropdown) | **Direction** (dropdown) | **Transform** (dropdown) | **Delete** (✕)

- Wix Field dropdown populated from Wix Contacts schema via `wix-crm-backend`
- HubSpot Property dropdown populated from HubSpot Properties API on page load
- Direction options: `⇄ Both`, `→ Wix only`, `← HS only`
- Transform options: `none`, `trim`, `lowercase`
- "+ Add Mapping" button adds a new empty row
- "Save Mappings" writes all rows to `FieldMappings` collection
- Validation: no duplicate `hubspotProperty` values unless direction is different

---

## Section 5 — Form Capture (Feature #2)

### Flow
1. Site owner builds form in Wix native form builder
2. On submission, Wix fires `wixForms.onFormSubmit` backend event
3. `form-capture.js` receives submission payload
4. Enrich with UTM + attribution context:
   - Frontend widget reads UTM params from `wix-window` query params and writes them into hidden form fields before submission
   - Backend reads: `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`
   - Backend reads: `page_url` (from Wix `wix-location`), `referrer`, `submitted_at`
5. Map form fields → HubSpot properties using `FieldMappings`
6. Check `ContactIdMap` — does this email already exist?
   - YES → update existing HubSpot contact
   - NO → create new HubSpot contact, add to `ContactIdMap`
7. Tag write with `syncId` to prevent echo from bi-directional sync

### UTM Attribution Storage
UTM params stored as HubSpot contact properties:
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`
- `original_source_url`, `original_referrer`, `first_form_submitted_at`

---

## Section 6 — Security

- HubSpot OAuth 2.0 only — no API keys in frontend or Wix Data
- All tokens stored in Wix SecretManager; never returned to browser
- Incoming HubSpot webhooks verified with HMAC-SHA256 signature check
- Sync endpoints (`/_functions/hubspot-webhook`) validate signature before processing
- Dashboard API calls go through Wix's authenticated session — no raw tokens in transit
- Logging: never log `access_token`, `refresh_token`, or contact PII
- `FieldMappings` and `SyncLog` collections use Wix Data permissions — backend-only write access

---

## Deliverables

| # | Item |
|---|---|
| A | API Plan (listed per feature above) |
| B1 | OAuth connect/disconnect via dashboard |
| B2 | Field mapping table UI + persistence |
| B3 | Bi-directional contact sync with loop prevention |
| B4 | Wix form → HubSpot lead capture with UTM context |
| C | GitHub repo (public) |
| D | Wix username for reviewer to test app install |
