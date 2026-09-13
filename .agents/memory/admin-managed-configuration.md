---
name: Admin-managed configuration
description: Rules for keeping countries, operators, payment accounts, and platform settings editable after initial seeding
---

Bootstrap data is only for creating missing records. Once a country, operator, payment account, or platform setting exists, startup seeding must preserve the administrator's current value and the runtime must read the database as the source of truth.

**Why:** Re-adding a removed operator during every startup makes the admin panel misleading and can silently undo an intentional configuration change.

**How to apply:** Use seed code to insert defaults only when rows are absent. Validate runtime values as required configuration and fail clearly when they are missing instead of silently falling back to a business constant.