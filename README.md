# Wix ↔ HubSpot Integration

A two-way contact sync between a Wix site and HubSpot CRM. Built with Next.js 14 (App Router), deployed on Vercel, backed by Supabase Postgres.

**Live dashboard:** connect your HubSpot account, configure which fields sync in which direction, and watch contacts flow between both platforms in real time.

---

## How it works

```
Wix site ──webhook──▶ /api/wix-webhook ──▶ sync_queue ──▶ cron ──▶ HubSpot CRM
HubSpot CRM ─webhook─▶ /api/hubspot-webhook ─▶ sync_queue ──▶ cron ──▶ Wix site
```

Events from either side land in a Supabase queue. A daily Vercel Cron job (or manual trigger) drains the queue, applying field mappings, deduplicating with a sync_log table, and stamping processed contacts with a `_sync_id` to stop echo loops.

---

## Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── start-oauth/          # Kicks off HubSpot OAuth
│   │   ├── oauth-callback/       # Receives code, saves tokens, registers webhooks
│   │   ├── hubspot-webhook/      # Receives HubSpot events (HMAC-verified)
│   │   ├── wix-webhook/          # Receives Wix contact events + UTM data
│   │   ├── cron/sync/            # Vercel Cron — drains sync queue
│   │   ├── connection-status/    # Dashboard stats
│   │   ├── field-mappings/       # Read field mapping config
│   │   ├── save-field-mappings/  # Write field mapping config
│   │   ├── disconnect/           # Deregisters webhooks, clears tokens
│   │   └── sync-log/             # Last 30 queue items for dashboard
│   └── dashboard/
│       └── page.jsx              # Single-page tabbed dashboard
└── lib/
    ├── db.js                     # Supabase singleton
    ├── services/
    │   ├── hubspot-client.js     # HubSpot REST API + auto token refresh
    │   ├── hubspot-oauth.js      # OAuth flow helpers
    │   ├── wix-client.js         # Wix Contacts v4 REST API
    │   ├── token-store.js        # Read/write/clear OAuth tokens in DB
    │   ├── contact-mapper.js     # Translate fields between platforms
    │   ├── utm-enricher.js       # Extract UTM params → HubSpot attribution
    │   └── loop-guard.js         # Detects sync echoes via _sync_id
    ├── data-access/
    │   ├── sync-queue.js         # Enqueue, fetch batch, mark done/failed
    │   ├── sync-log.js           # Idempotency log (24h TTL)
    │   ├── contact-id-map.js     # Wix ID ↔ HubSpot ID mapping table
    │   └── field-mappings.js     # CRUD for field mapping rules
    └── jobs/
        └── sync-worker.js        # Core sync orchestrator (queue drain + Wix polling)
```

---

## Database schema

Four tables in Supabase Postgres (see `supabase/migrations/001_initial.sql`):

```sql
-- OAuth tokens (single row, id = 1)
oauth_tokens(id, access_token, refresh_token, expires_at, portal_id, updated_at)

-- Wix ↔ HubSpot contact ID pairs
contact_id_map(id, wix_contact_id, hubspot_contact_id, last_sync_source, last_synced_at, created_at)

-- Field mapping rules (replaced on each save)
field_mappings(id, wix_field, hubspot_property, direction, transform, created_at)

-- Async event queue
sync_queue(id, sync_id, source, event_type, contact_id, payload, status, retry_count, error, created_at)
-- status: pending → processing → done | failed  (auto-retries up to 3×)

-- Processed-event log for idempotency (auto-purged after 24h)
sync_log(id, sync_id, source, wix_contact_id, hubspot_contact_id, created_at)
```

---

## OAuth flow

1. User clicks **Connect HubSpot** → `/api/start-oauth` builds an auth URL (scopes: `crm.objects.contacts.read/write`, `crm.schemas.contacts.read`) and stores a random state in an httpOnly cookie.
2. User approves in HubSpot → redirected to `/api/oauth-callback`.
3. Server validates state cookie, exchanges code for tokens, saves them to `oauth_tokens`.
4. Two webhook subscriptions are registered: `contact.creation` and `contact.propertyChange`.
5. User lands on `/dashboard?connected=true`.

Token refresh is automatic: before each HubSpot API call, if the token expires within 5 minutes it is silently refreshed.

---

## Webhook security

**HubSpot → `/api/hubspot-webhook`**
- Validates the `X-HubSpot-Signature-v3` header using HMAC-SHA256 over `method + url + body + timestamp`, compared as base64.
- Falls back to v2 (SHA256 of `secret + method + url + body`) and v1 (SHA256 of `secret + body`).
- Requests older than 5 minutes are rejected.

**Wix → `/api/wix-webhook`**
- Deduplication via `_sync_id` extended field: if HubSpot→Wix wrote the update, the resulting Wix webhook is ignored.

---

## Sync loop prevention

Every sync stamps the destination contact:
- **Wix contacts** updated from HubSpot receive `_sync_id` in extended fields.
- **HubSpot contacts** updated from Wix receive a `hs_sync_id` property.

When the echoed webhook arrives, `loop-guard.js` detects the ID and drops the event before it reaches the queue.

---

## Field mappings

Configured from the dashboard **Field Mapping** tab. Each rule specifies:

| Setting | Options |
|---|---|
| Wix Field | `email`, `firstName`, `lastName`, `phone` |
| HubSpot Property | any contact property (fetched live from HubSpot) |
| Direction | `⇄ Both`, `→ Wix only`, `← HS only` |
| Transform | `none`, `trim`, `lowercase` |

Mappings are applied by `contact-mapper.js` at sync time. The worker only pushes an update if the mapped fields have actually changed.

---

## UTM enrichment

When a Wix form submission arrives via `/api/wix-webhook`, the following fields are extracted and written to HubSpot attribution properties on contact create:

`utm_source` · `utm_medium` · `utm_campaign` · `utm_term` · `utm_content` · `page_url` · `referrer`

---

## Dashboard

Single-page React app at `/dashboard` with three tabs:

**Connection** — connected portal ID, last sync time, stats (contacts synced / leads captured / pending), connect and disconnect controls.

**Field Mapping** — add, edit, and remove field mapping rules. Load failure disables save to prevent data loss.

**Sync Log** — last 30 queue items with status dots, source badges (wix/hubspot), relative timestamps, and inline error messages. Filter by All / Done / Failed / Pending. Lazy-loaded on first visit.

---

## Setup

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- A [HubSpot developer app](https://developers.hubspot.com) with OAuth enabled
- A Wix site with [Wix REST API](https://dev.wix.com/docs/rest) access
- A [Vercel](https://vercel.com) account

### 1. Clone and install

```bash
git clone https://github.com/KE-NETIZEN-OOPS/wix-hubspot-integration.git
cd wix-hubspot-integration
npm install
```

### 2. Run database migrations

In the Supabase SQL editor, run `supabase/migrations/001_initial.sql`.

### 3. Configure environment variables

Create `.env.local` for local dev, or set these in your Vercel project dashboard:

```
NEXT_PUBLIC_SUPABASE_URL       # https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY      # Supabase service role key (server-side only)

HUBSPOT_CLIENT_ID              # HubSpot OAuth app client ID
HUBSPOT_CLIENT_SECRET          # HubSpot OAuth app client secret
HUBSPOT_APP_ID                 # HubSpot app ID (for webhook management)
HUBSPOT_WEBHOOK_SECRET         # HubSpot webhook signing secret

WIX_API_KEY                    # Wix REST API key
WIX_SITE_ID                    # Wix site ID

NEXT_PUBLIC_APP_URL            # Your deployment URL (no trailing slash)
CRON_SECRET                    # Random secret to authenticate the cron endpoint
```

Set the HubSpot app **Redirect URL** to `https://your-app.vercel.app/api/oauth-callback`.

### 4. Deploy

```bash
npx vercel --prod
```

`vercel.json` includes a daily cron schedule for `/api/cron/sync` (Vercel Hobby: once per day at 00:00 UTC).

### 5. Connect HubSpot

Open `/dashboard`, click **Connect HubSpot**, and complete the OAuth flow. Webhook subscriptions are registered automatically on success.

---

## Local development

```bash
npm run dev        # Next.js dev server on :3000
npm test           # Jest unit tests
npx playwright test  # E2E tests (starts dev server automatically)
```

Trigger a sync manually:

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/sync
```

---

## Testing

**Unit tests** (Jest) — data access layer, mappers, and service utilities.

**E2E tests** (Playwright) — 28 tests covering all dashboard tabs, API validation, redirect behaviour, filter logic, lazy loading, and error states. UI tests use request interception against the local dev server; API integration tests run against the production deployment.

```bash
npx playwright test --reporter=list
```

---

## Security notes

- OAuth tokens are stored server-side only and never returned to the browser.
- HubSpot webhooks are rejected if the HMAC signature is invalid or the request is older than 5 minutes.
- The Supabase service role key is used exclusively in server-side API routes.
- No contact PII is written to application logs.
- The cron endpoint requires a `Bearer` token matching `CRON_SECRET`.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Database | Supabase Postgres |
| Hosting | Vercel |
| Scheduling | Vercel Cron |
| Unit tests | Jest |
| E2E tests | Playwright |
