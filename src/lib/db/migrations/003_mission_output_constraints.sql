-- Mission output format and constraints (composer fields persisted for edit round-trip)
ALTER TABLE missions ADD COLUMN output_format TEXT;
ALTER TABLE missions ADD COLUMN constraints TEXT;
