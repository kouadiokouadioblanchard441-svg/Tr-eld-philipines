---
name: Imported database setup
description: Fresh imported projects may have only Replit's session table before the checked-in application schema is applied.
---

When setting up an imported app that uses Drizzle and connect-pg-simple, preserve the existing `session` table and treat application tables as new, even if Drizzle presents an ambiguous rename prompt. A database can contain an older application table shape while still appearing configured; check required columns before relying on integration tests.

**Why:** Drizzle can misidentify a pre-existing session table as a rename candidate for the first application table during an interactive schema push.

**How to apply:** Inspect `information_schema` first; apply the checked-in schema transactionally while skipping only tables already present and structurally identical. If `drizzle-kit push` detects drift and requires a non-TTY confirmation, use a targeted versioned migration or idempotent DDL for only the intended new objects; never use a broad force push when it could rename or drop session data. Do not treat a failing application query against a missing newer column as a test failure until the database has been brought to the checked-in schema.

The application now prefers the external PostgreSQL URL stored in `SUPABASE_DATABASE_URL` when present, while retaining `DATABASE_URL` as the fallback. A fresh external database must receive the core schema, later migrations, and the existing application data before the app is switched to it.

**Why:** The external database initially accepted connections but had no application tables, so startup could listen on port 5000 while background jobs failed on missing relations.

**How to apply:** Create the schema idempotently, apply post-baseline migrations (including news and support), migrate source data in dependency order, then restart and verify both startup logs and row counts without printing the connection URL.