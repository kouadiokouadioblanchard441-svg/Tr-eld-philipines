#!/bin/bash
set -euo pipefail

# Keep post-merge setup non-interactive and safe for the imported Neon database.
# `drizzle-kit push` can interpret historical tables/columns as renames or
# drops. Versioned SQL migrations are reviewed and applied explicitly instead;
# this hook only checks their local consistency and rebuilds the application.
npm install --no-audit --no-fund
npm run db:check
npm run build
