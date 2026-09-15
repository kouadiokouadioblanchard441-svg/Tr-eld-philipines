-- New accounts must start with no balance.
-- The application already sets this explicitly; this also removes the
-- historical database default so direct inserts cannot recreate the old
-- registration bonus.
ALTER TABLE IF EXISTS "users"
  ALTER COLUMN "balance" SET DEFAULT '0';