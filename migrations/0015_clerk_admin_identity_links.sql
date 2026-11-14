-- Explicit Clerk -> internal Admin principal binding.
-- Never grant admin privileges from email, public metadata, or client claims alone.
CREATE TABLE IF NOT EXISTS clerk_admin_identity_links (
  clerk_user_id TEXT PRIMARY KEY CHECK(length(clerk_user_id) BETWEEN 8 AND 200),
  admin_principal_id TEXT NOT NULL UNIQUE CHECK(length(admin_principal_id) BETWEEN 3 AND 120),
  role TEXT NOT NULL DEFAULT 'admin' CHECK(role = 'admin'),
  session_version INTEGER NOT NULL DEFAULT 1 CHECK(session_version >= 1),
  disabled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(clerk_user_id LIKE 'user_%')
);
CREATE INDEX IF NOT EXISTS idx_clerk_admin_identity_principal ON clerk_admin_identity_links(admin_principal_id);

CREATE TABLE IF NOT EXISTS revoked_clerk_tokens (
  revocation_key TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL
);
