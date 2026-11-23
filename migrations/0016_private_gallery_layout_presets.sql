-- Presentation-only templates. Existing albums retain their original layout.
-- No image bytes, session, ownership or publication state is changed.
ALTER TABLE client_galleries
  ADD COLUMN layout_preset TEXT NOT NULL DEFAULT 'classico'
  CHECK(layout_preset IN ('classico','editorial','colagem','mosaico','cinema'));
