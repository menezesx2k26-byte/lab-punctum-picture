-- Optional snapshot publication fences. No existing editorial/private rows change.
-- A crashed publication deliberately leaves its fence in place. Reconcile the
-- publication before removing it manually, never expire it on a timer.
CREATE TABLE public_home_snapshot_mutations (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
