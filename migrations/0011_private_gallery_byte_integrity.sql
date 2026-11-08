-- Additive integrity evidence for original private photos. Existing rows are
-- deliberately nullable: historical uploads cannot be assigned invented hashes.
ALTER TABLE client_gallery_upload_intents ADD COLUMN sha256 TEXT
  CHECK (sha256 IS NULL OR (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'));
ALTER TABLE client_gallery_images ADD COLUMN original_sha256 TEXT
  CHECK (original_sha256 IS NULL OR (length(original_sha256) = 64 AND original_sha256 NOT GLOB '*[^0-9a-f]*'));
