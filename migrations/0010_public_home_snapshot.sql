-- Optional public GET / SSR snapshot. This table is inert until the separate
-- PUBLIC_HOME_SNAPSHOT_ENABLED flag and a matching deployment build ID exist.
-- Never store private/gallery/admin HTML here.
CREATE TABLE public_home_snapshot (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  epoch INTEGER NOT NULL DEFAULT 0 CHECK (epoch >= 0),
  snapshot_epoch INTEGER,
  build_id TEXT,
  html_sha256 TEXT,
  html TEXT,
  CHECK (
    (snapshot_epoch IS NULL AND build_id IS NULL AND html_sha256 IS NULL AND html IS NULL)
    OR
    (snapshot_epoch IS NOT NULL AND snapshot_epoch = epoch AND build_id IS NOT NULL AND html_sha256 IS NOT NULL AND html IS NOT NULL)
  )
);
INSERT INTO public_home_snapshot (id, epoch) VALUES (1, 0);
