---
name: Application database selection
description: The project application database is Neon via SUPABASE_DATABASE_URL, which can differ from the built-in Replit database tools.
---

The running application uses Neon through `SUPABASE_DATABASE_URL` before falling back to `DATABASE_URL`. The built-in Replit database may be reachable but contain different configuration or test records, so application-data checks must use the same connection as `server/db.ts`.

**Why:** A configuration lookup against the built-in database showed different Burkina Faso operators and payment numbers from the live application connection.

**How to apply:** For app-specific data verification or requested configuration changes, query through the application's configured Neon connection and never assume the built-in database is the source of business data.