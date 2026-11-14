-- Clerk pilot only: no production rollout or automatic identity association.
-- Preserve client_accounts.id as the canonical ownership key for galleries.
CREATE TABLE IF NOT EXISTS clerk_pilot_identity_links (
  clerk_user_id TEXT PRIMARY KEY CHECK(length(clerk_user_id) BETWEEN 8 AND 200),
  client_id TEXT NOT NULL UNIQUE REFERENCES client_accounts(id),
  session_version_at_link INTEGER NOT NULL CHECK(session_version_at_link >= 1),
  created_at TEXT NOT NULL,
  CHECK(clerk_user_id LIKE 'user_%')
);
CREATE INDEX IF NOT EXISTS idx_clerk_pilot_identity_client ON clerk_pilot_identity_links(client_id);
