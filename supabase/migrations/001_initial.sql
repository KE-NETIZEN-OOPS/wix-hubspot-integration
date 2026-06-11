CREATE TABLE IF NOT EXISTS oauth_tokens (
  id int PRIMARY KEY DEFAULT 1,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at bigint NOT NULL,
  portal_id text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contact_id_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wix_contact_id text UNIQUE NOT NULL,
  hubspot_contact_id text NOT NULL,
  last_sync_source text,
  last_synced_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS field_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wix_field text NOT NULL,
  hubspot_property text NOT NULL,
  direction text NOT NULL DEFAULT 'both',
  transform text NOT NULL DEFAULT 'none',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_id text UNIQUE NOT NULL,
  source text NOT NULL,
  event_type text NOT NULL,
  contact_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',
  retry_count int NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sync_queue_status_idx ON sync_queue(status);

CREATE TABLE IF NOT EXISTS sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_id text UNIQUE NOT NULL,
  source text NOT NULL,
  wix_contact_id text,
  hubspot_contact_id text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sync_log_sync_id_idx ON sync_log(sync_id);
