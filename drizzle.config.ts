import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("No database URL configured.");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  // Keep schema changes reviewable. `db:push` must never silently choose a
  // rename/drop for a historical Neon table or column.
  strict: true,
  verbose: true,
  schemaFilter: ["public"],
  dbCredentials: {
    url: databaseUrl,
  },
});
