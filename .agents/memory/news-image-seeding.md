---
name: News image seeding
description: Durable guidance for adding image-backed demo news posts to the TELD project.
---

For demo publications, prefer stable public image URLs when inserting content through database tooling. Shell output used to move base64 data can be truncated before it reaches the database, producing invalid Data URLs even when the source file is valid.

**Why:** The news feature stores image references in the publication record, and a truncated Data URL renders as a broken image while looking superficially like a successful insert.

**How to apply:** Keep local source copies under attached_assets/image_search when useful, but validate the final database image reference and its actual browser rendering before considering seeded publications complete.