import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

// Neon is the single application database. Keep DATABASE_URL as a fallback
// for environments where the external connection is injected there.
const databaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("No database URL configured.");
}

export const pool = new Pool({
  connectionString: databaseUrl,
});
export const db = drizzle(pool, { schema });
