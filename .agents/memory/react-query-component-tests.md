---
name: React Query component tests
description: Test-runner lifecycle guidance for React components that use TanStack Query.
---

Node-based component tests that reuse the app's QueryClient should use zero query and mutation garbage-collection lifetimes in the test client; otherwise default cache timers can keep the worker alive after assertions finish.

**Why:** The production QueryClient defaults are appropriate for the application, but they create long-lived timers in a Node test process and make an otherwise passing component suite hang.

**How to apply:** Override `gcTime` only on the test client before rendering, and clear query and mutation caches during teardown. Do not change the production defaults just to accommodate tests.