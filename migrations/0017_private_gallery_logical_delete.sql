-- Logical deletion retains private originals and related records.
ALTER TABLE client_galleries ADD COLUMN deleted_at TEXT CHECK(deleted_at IS NULL OR status = 'archived');
