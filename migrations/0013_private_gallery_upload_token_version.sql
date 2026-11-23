-- Preserve the original direct-upload HMAC contract for existing intents.
-- New intents opt into v3, whose token also binds the client-computed SHA-256.
ALTER TABLE client_gallery_upload_intents
  ADD COLUMN upload_token_version INTEGER NOT NULL DEFAULT 2
  CHECK (upload_token_version IN (2, 3));
