-- Experiment only. DO NOT APPLY as migrations/0010. SQLite prototype for RED/GREEN contract.
-- Foreign keys alone do not enforce these state/immutability rules.
CREATE TRIGGER r5_guard_final_requires_confirmed BEFORE INSERT ON r5_ref_final_versions
WHEN NOT EXISTS (SELECT 1 FROM r5_ref_selection_revisions s
  WHERE s.gallery_id=NEW.gallery_id AND s.id=NEW.selection_revision_id AND s.state='confirmed')
BEGIN SELECT RAISE(ABORT,'R5_UNCONFIRMED_SELECTION'); END;
CREATE TRIGGER r5_guard_delivery_requires_confirmed BEFORE INSERT ON r5_ref_delivery_revisions
WHEN NOT EXISTS (SELECT 1 FROM r5_ref_selection_revisions s
  WHERE s.gallery_id=NEW.gallery_id AND s.id=NEW.selection_revision_id AND s.state='confirmed')
BEGIN SELECT RAISE(ABORT,'R5_UNCONFIRMED_DELIVERY'); END;
CREATE TRIGGER r5_guard_final_metadata_immutable BEFORE UPDATE ON r5_ref_final_versions
BEGIN SELECT RAISE(ABORT,'R5_FINAL_IMMUTABLE'); END;
CREATE TRIGGER r5_guard_confirmed_selection_immutable BEFORE UPDATE ON r5_ref_selection_revisions
WHEN OLD.state='confirmed'
BEGIN SELECT RAISE(ABORT,'R5_SELECTION_CONFIRMATION_IMMUTABLE'); END;
CREATE TRIGGER r5_guard_confirmed_items_insert BEFORE INSERT ON r5_ref_selection_items
WHEN EXISTS (SELECT 1 FROM r5_ref_selection_revisions s
  WHERE s.id=NEW.selection_revision_id AND s.gallery_id=NEW.gallery_id AND s.state='confirmed')
BEGIN SELECT RAISE(ABORT,'R5_SELECTION_ITEMS_IMMUTABLE'); END;
CREATE TRIGGER r5_guard_published_delivery_items_insert BEFORE INSERT ON r5_ref_delivery_items
WHEN EXISTS (SELECT 1 FROM r5_ref_workflows w WHERE w.gallery_id=NEW.gallery_id AND w.published_revision_id=NEW.delivery_revision_id)
BEGIN SELECT RAISE(ABORT,'R5_PUBLISHED_DELIVERY_IMMUTABLE'); END;
CREATE TRIGGER r5_guard_published_delivery_items_update BEFORE UPDATE ON r5_ref_delivery_items
WHEN EXISTS (SELECT 1 FROM r5_ref_workflows w WHERE w.gallery_id=OLD.gallery_id AND w.published_revision_id=OLD.delivery_revision_id)
BEGIN SELECT RAISE(ABORT,'R5_PUBLISHED_DELIVERY_IMMUTABLE'); END;
CREATE TRIGGER r5_guard_published_delivery_items_delete BEFORE DELETE ON r5_ref_delivery_items
WHEN EXISTS (SELECT 1 FROM r5_ref_workflows w WHERE w.gallery_id=OLD.gallery_id AND w.published_revision_id=OLD.delivery_revision_id)
BEGIN SELECT RAISE(ABORT,'R5_PUBLISHED_DELIVERY_IMMUTABLE'); END;
CREATE TRIGGER r5_guard_published_delivery_revision_update BEFORE UPDATE ON r5_ref_delivery_revisions
WHEN EXISTS (SELECT 1 FROM r5_ref_workflows w WHERE w.gallery_id=OLD.gallery_id AND w.published_revision_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'R5_PUBLISHED_DELIVERY_IMMUTABLE'); END;
CREATE TRIGGER r5_guard_confirmed_items_update BEFORE UPDATE ON r5_ref_selection_items
WHEN EXISTS (SELECT 1 FROM r5_ref_selection_revisions s
  WHERE s.id=OLD.selection_revision_id AND s.gallery_id=OLD.gallery_id AND s.state='confirmed')
BEGIN SELECT RAISE(ABORT,'R5_SELECTION_ITEMS_IMMUTABLE'); END;
CREATE TRIGGER r5_guard_confirmed_items_delete BEFORE DELETE ON r5_ref_selection_items
WHEN EXISTS (SELECT 1 FROM r5_ref_selection_revisions s
  WHERE s.id=OLD.selection_revision_id AND s.gallery_id=OLD.gallery_id AND s.state='confirmed')
BEGIN SELECT RAISE(ABORT,'R5_SELECTION_ITEMS_IMMUTABLE'); END;
-- Draft-only receipt/outbox reference. Not a proposed final 0010 schema.
CREATE TABLE r5_guard_publish_receipt (
  gallery_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  delivery_revision_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(gallery_id,idempotency_key),
  FOREIGN KEY(gallery_id,delivery_revision_id)
    REFERENCES r5_ref_delivery_revisions(gallery_id,id) ON DELETE RESTRICT
);
CREATE TABLE r5_guard_outbox (
  gallery_id TEXT NOT NULL,
  delivery_revision_id TEXT NOT NULL,
  event_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed')),
  FOREIGN KEY(gallery_id,delivery_revision_id)
    REFERENCES r5_ref_delivery_revisions(gallery_id,id) ON DELETE RESTRICT
);
