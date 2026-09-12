---
name: English localization
description: French is the default language across the visible HSBC Group interface
---

User-facing application text, validation errors, notifications, metadata, and date/number formats should use French (`fr-FR`) by default across the visible HSBC Group interface, including client pages, modals, history, payment flows, and administration. The login and registration screens remain French, including their validation messages and WhatsApp phone label.

**Why:** The product request expanded French from authentication-only to the full visible interface. Existing database settings are intentionally preserved by the seed process, so translating source defaults alone does not rewrite customized values already stored.

**How to apply:** Use `fr-FR` for user-visible number/date formatting and translate UI strings, validation messages, notifications, and empty states. Preserve API routes, database identifiers, provider names, payment commands, status keys, and asset paths. When persisted settings are displayed, do not overwrite administrator-customized values just to localize defaults.