-- DOCUMENTATION-ONLY reference for future RED contracts; not product migration 0010.
-- Executed only against synthetic sqlite3 in-memory DDL 0009.
CREATE UNIQUE INDEX r5_ref_gallery_owner_unique ON client_galleries(id, client_id);
CREATE TABLE r5_ref_selection_revisions (
  id TEXT PRIMARY KEY,
  gallery_id TEXT NOT NULL REFERENCES client_galleries(id) ON DELETE RESTRICT,
  state TEXT NOT NULL CHECK (state IN ('open', 'confirmed')),
  UNIQUE (gallery_id,id)
);
CREATE TABLE r5_ref_selection_items (
  gallery_id TEXT NOT NULL,
  selection_revision_id TEXT NOT NULL,
  proof_image_id TEXT NOT NULL,
  PRIMARY KEY (gallery_id,selection_revision_id,proof_image_id),
  FOREIGN KEY (gallery_id,selection_revision_id) REFERENCES r5_ref_selection_revisions(gallery_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (gallery_id,proof_image_id) REFERENCES client_gallery_images(gallery_id,id) ON DELETE RESTRICT
);
CREATE TABLE r5_ref_final_versions (
  id TEXT PRIMARY KEY,
  gallery_id TEXT NOT NULL,
  selection_revision_id TEXT NOT NULL,
  proof_image_id TEXT NOT NULL,
  private_object_key TEXT NOT NULL UNIQUE,
  UNIQUE(gallery_id,selection_revision_id,id),
  UNIQUE(gallery_id,selection_revision_id,proof_image_id,id),
  FOREIGN KEY(gallery_id,selection_revision_id,proof_image_id)
    REFERENCES r5_ref_selection_items(gallery_id,selection_revision_id,proof_image_id) ON DELETE RESTRICT
);
CREATE TABLE r5_ref_delivery_revisions (
  id TEXT PRIMARY KEY,
  gallery_id TEXT NOT NULL,
  selection_revision_id TEXT NOT NULL,
  revision_no INTEGER NOT NULL CHECK(revision_no>0),
  UNIQUE(gallery_id,revision_no),
  UNIQUE(gallery_id,id),
  UNIQUE(gallery_id,id,selection_revision_id),
  FOREIGN KEY(gallery_id,selection_revision_id) REFERENCES r5_ref_selection_revisions(gallery_id,id) ON DELETE RESTRICT
);
CREATE TABLE r5_ref_delivery_items (
  gallery_id TEXT NOT NULL,
  delivery_revision_id TEXT NOT NULL,
  selection_revision_id TEXT NOT NULL,
  proof_image_id TEXT NOT NULL,
  final_version_id TEXT NOT NULL,
  PRIMARY KEY(gallery_id,delivery_revision_id,proof_image_id),
  FOREIGN KEY(gallery_id,delivery_revision_id,selection_revision_id)
    REFERENCES r5_ref_delivery_revisions(gallery_id,id,selection_revision_id) ON DELETE RESTRICT,
  FOREIGN KEY(gallery_id,selection_revision_id,proof_image_id,final_version_id)
    REFERENCES r5_ref_final_versions(gallery_id,selection_revision_id,proof_image_id,id) ON DELETE RESTRICT
);
CREATE TABLE r5_ref_workflows (
  gallery_id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  current_selection_id TEXT,
  published_revision_id TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(gallery_id,client_id) REFERENCES client_galleries(id,client_id) ON DELETE RESTRICT,
  FOREIGN KEY(gallery_id,current_selection_id) REFERENCES r5_ref_selection_revisions(gallery_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(gallery_id,published_revision_id) REFERENCES r5_ref_delivery_revisions(gallery_id,id) ON DELETE RESTRICT
);
