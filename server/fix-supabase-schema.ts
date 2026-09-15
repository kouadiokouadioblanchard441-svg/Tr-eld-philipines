/**
 * This legacy helper used to rewrite imported Neon tables in place.
 *
 * Schema changes now belong in reviewed, additive SQL migrations under
 * `migrations/`. Keeping this entry point as a hard failure prevents an old
 * deployment command from silently deleting historical columns or data.
 */
console.error(
  "This legacy schema fixer is disabled. Review and apply the versioned migration in migrations/ instead.",
);
process.exit(1);
